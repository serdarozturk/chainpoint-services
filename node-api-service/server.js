require('dotenv').config()
const _ = require('lodash')
const restify = require('restify')
const corsMiddleware = require('restify-cors-middleware')
const amqp = require('amqplib/callback_api')
const async = require('async')
const uuidTime = require('uuid-time')

require('dotenv').config()

const REDIS_CONNECT_URI = process.env.REDIS_CONNECT_URI || 'redis://redis:6379'
const r = require('redis')
const redis = r.createClient(REDIS_CONNECT_URI)

// Generate a v1 UUID (time-based)
// see: https://github.com/broofa/node-uuid
const uuidv1 = require('uuid/v1')

const uuidValidate = require('uuid-validate')

// The maximum number of messages sent over the channel that can be awaiting acknowledgement, 0 = no limit
const RMQ_PREFETCH_COUNT = process.env.RMQ_PREFETCH_COUNT || 0

// The queue name for message consumption originating from proof gen service
const RMQ_WORK_IN_QUEUE = process.env.RMQ_WORK_IN_QUEUE || 'work.api'

// The queue name for outgoing message to the splitter service
const RMQ_WORK_OUT_QUEUE = process.env.RMQ_WORK_OUT_QUEUE || 'work.splitter'

// Connection string w/ credentials for RabbitMQ
const RABBITMQ_CONNECT_URI = process.env.RABBITMQ_CONNECT_URI || 'amqp://chainpoint:chainpoint@rabbitmq'

// The lifespan of stored proofs, in minutes
const PROOF_EXPIRE_MINUTES = process.env.PROOF_EXPIRE_MINUTES || 60

// The maximum number of proofs that can be requested in one GET /proofs request
const GET_PROOFS_MAX = process.env.GET_PROOFS_MAX || 250

// The channel used for all amqp communication
// This value is set once the connection has been established
// API methods should return 502 when this value is null
var amqpChannel = null

/**
 * Opens an AMPQ connection and channel
 * Retry logic is included to handle losses of connection
 *
 * @param {string} connectionString - The connection string for the RabbitMQ instance, an AMQP URI
 */
function amqpOpenConnection (connectionString) {
  async.waterfall([
    (callback) => {
      // connect to rabbitmq server
      amqp.connect(connectionString, (err, conn) => {
        if (err) return callback(err)
        return callback(null, conn)
      })
    },
    (conn, callback) => {
      // if the channel closes for any reason, attempt to reconnect
      conn.on('close', () => {
        console.error('Connection to RMQ closed.  Reconnecting in 5 seconds...')
        amqpChannel = null
        setTimeout(amqpOpenConnection.bind(null, connectionString), 5 * 1000)
      })
      // create communication channel
      conn.createConfirmChannel((err, chan) => {
        if (err) return callback(err)
        // the connection and channel have been established
        // set 'amqpChannel' so that publishers have access to the channel
        console.log('Connection established')
        chan.assertQueue(RMQ_WORK_IN_QUEUE, { durable: true })
        chan.assertQueue(RMQ_WORK_OUT_QUEUE, { durable: true })
        chan.prefetch(RMQ_PREFETCH_COUNT)
        amqpChannel = chan
        // Continuously load the HASHES from RMQ with hash objects to process)
        chan.consume(RMQ_WORK_IN_QUEUE, (msg) => {
          processProofMessage(msg)
        })
        return callback(null)
      })
    }
  ], (err) => {
    if (err) {
      // catch errors when attempting to establish connection
      console.error('Cannot establish connection. Attempting in 5 seconds...')
      setTimeout(amqpOpenConnection.bind(null, connectionString), 5 * 1000)
    }
  })
}

/**
* Parses a proof message and performs the required work for that message
*
* @param {amqp message object} msg - The AMQP message received from the queue
*/
function processProofMessage (msg) {
  if (msg !== null) {
    let hashId = msg.content.toString()
    redis.get(hashId, (err, res) => {
      if (err) {
        console.log(err)
      } else {
        console.log(res)
      }
    })
    amqpChannel.ack(msg)
    console.log(RMQ_WORK_IN_QUEUE, 'consume message acked')
  }
}

/**
 * Add specified minutes to a Date object
 *
 * @param {Date} date - The starting date
 * @param {number} minutes - The number of minutes to add to the date
 * @returns {Date}
 */
function addMinutes (date, minutes) {
  return new Date(date.getTime() + (minutes * 60000))
}

/**
 * Convert Date to ISO8601 string, stripping milliseconds
 * '2017-03-19T23:24:32Z'
 *
 * @param {Date} date - The date to convert
 * @returns {string} An ISO8601 formatted time string
 */
function formatDateISO8601NoMs (date) {
  return date.toISOString().slice(0, 19) + 'Z'
}

/**
 * Convert strings in an Array of hashes to lower case
 *
 * @param {string[]} hashes - An array of string hashes to convert to lower case
 * @returns {string[]} An array of lowercase hash strings
 */
function lowerCaseHashes (hashes) {
  return hashes.map((hash) => {
    return hash.toLowerCase()
  })
}

/**
 * Generate the values for the 'meta' property in a POST /hashes response.
 *
 * Returns an Object with metadata about a POST /hashes request
 * including a 'timestamp', and hints for estimated time to completion
 * for various operations.
 *
 * @returns {Object}
 */
function generatePostHashesResponseMetadata () {
  let metaDataObj = {}
  let timestamp = new Date()
  metaDataObj.submitted_at = formatDateISO8601NoMs(timestamp)

  metaDataObj.processing_hints = {
    cal: formatDateISO8601NoMs(addMinutes(timestamp, 1)),
    eth: formatDateISO8601NoMs(addMinutes(timestamp, 11)),
    btc: formatDateISO8601NoMs(addMinutes(timestamp, 61))
  }

  return metaDataObj
}

/**
 * Converts an array of hash strings to a object suitable to
 * return to HTTP clients.
 *
 * @param {string[]} hashes - An array of string hashes to process
 * @returns {Object} An Object with 'meta' and 'hashes' properties
 */
function generatePostHashesResponse (hashes) {
  let lcHashes = lowerCaseHashes(hashes)
  let hashObjects = lcHashes.map((hash) => {
    let hashObj = {}
    hashObj.hash_id = uuidv1()
    hashObj.hash = hash
    return hashObj
  })

  return {
    meta: generatePostHashesResponseMetadata(hashObjects),
    hashes: hashObjects
  }
}

/**
 * POST /hashes handler
 *
 * Expects a JSON body with the form:
 *   {"hashes": ["hash1", "hash2", "hashN"]}
 *
 * The `hashes` key must reference a JSON Array
 * of strings representing each hash to anchor.
 *
 * Each hash must be:
 * - in Hexadecimal form [a-fA-F0-9]
 * - minimum 40 chars long (e.g. 20 byte SHA1)
 * - maximum 128 chars long (e.g. 64 byte SHA512)
 * - an even length string
 */
function postHashesV1 (req, res, next) {
  // validate content-type sent was 'application/json'
  if (req.contentType() !== 'application/json') {
    return next(new restify.InvalidArgumentError('invalid content type'))
  }

  // validate params has parse a 'hashes' key
  if (!req.params.hasOwnProperty('hashes')) {
    return next(new restify.InvalidArgumentError('invalid JSON body, missing hashes'))
  }

  // validate hashes param is an Array
  if (!_.isArray(req.params.hashes)) {
    return next(new restify.InvalidArgumentError('invalid JSON body, hashes is not an Array'))
  }

  // validate hashes param Array has at least one hash
  if (_.size(req.params.hashes) < 1) {
    return next(new restify.InvalidArgumentError('invalid JSON body, hashes Array is empty'))
  }

  // validate hashes param Array is not larger than allowed max length
  if (_.size(req.params.hashes) > 1000) {
    return next(new restify.InvalidArgumentError('invalid JSON body, hashes Array max size exceeded'))
  }

  // validate hashes are individually well formed
  let containsValidHashes = _.every(req.params.hashes, (hash) => {
    return /^([a-fA-F0-9]{2}){20,64}$/.test(hash)
  })

  if (!containsValidHashes) {
    return next(new restify.InvalidArgumentError('invalid JSON body, invalid hashes present'))
  }

  let responseObj = generatePostHashesResponse(req.params.hashes)

  // AMQP / RabbitMQ

  // validate amqp channel has been established
  if (!amqpChannel) {
    return next(new restify.InternalServerError('Message could not be delivered'))
  }
  amqpChannel.sendToQueue(RMQ_WORK_OUT_QUEUE, Buffer.from(JSON.stringify(responseObj)), { persistent: true },
    (err, ok) => {
      if (err !== null) {
        console.error(RMQ_WORK_OUT_QUEUE, 'publish message nacked')
        return next(new restify.InternalServerError('Message could not be delivered'))
      } else {
        console.log(RMQ_WORK_OUT_QUEUE, 'publish message acked')
      }
    })

  res.send(responseObj)
  return next()
}

/**
 * GET /proofs/:id handler
 *
 * Expects a query string Hash 'id' in the form of a Version 1 UUID
 *
 * Returns a chainpoint proof for the requested Hash ID
 */
function getProofsByIDV1 (req, res, next) {
  let hashIdResults = []
  // check if id parameter was included
  if (req.params && req.params.id) {
    // an id was specified in the url, so use that hash id only
    hashIdResults.push(req.params.id)
  } else if (req.headers && req.headers.ids) {
    // no id was specified in url, read from headers.ids
    hashIdResults = req.headers.ids.split(',')
  }
  // ensure at least one hash id was submitted
  if (hashIdResults.length === 0) {
    return next(new restify.InvalidArgumentError('invalid request, at least one hash id required'))
  }
  // ensure that the request count does not exceed the maximum setting
  if (hashIdResults.length > GET_PROOFS_MAX) {
    return next(new restify.InvalidArgumentError('invalid request, too many hash ids (' + GET_PROOFS_MAX + ' max)'))
  }

  // prepare results array to hold proof results
  hashIdResults = hashIdResults.map((hashId) => {
    return { hash_id: hashId.trim(), proof: null }
  })

  async.eachLimit(hashIdResults, 50, (hashIdResult, callback) => {
    // validate id param is proper UUIDv1
    if (!uuidValidate(hashIdResult.hash_id, 1)) return callback(null)
    // validate uuid time is in in valid range
    let uuidEpoch = uuidTime.v1(hashIdResult.hash_id)
    var nowEpoch = new Date().getTime()
    let uuidDiff = nowEpoch - uuidEpoch
    let maxDiff = PROOF_EXPIRE_MINUTES * 60 * 1000
    if (uuidDiff > maxDiff) return callback(null)
    // retrieve proof fromn storage
    redis.get(hashIdResult.hash_id, (err, proof) => {
      if (err) return callback(null)
      hashIdResult.proof = JSON.parse(proof)
      callback(null)
    })
  }, (err) => {
    if (err) return next(new restify.InternalError(err))
    res.send(hashIdResults)
    return next()
  })
}

/**
 * GET / handler
 *
 * Root path handler with default message.
 *
 */
function rootV1 (req, res, next) {
  return next(new restify.ImATeapotError('This is an API endpoint. Please consult https://chainpoint.org'))
}

// RESTIFY
var server = restify.createServer({
  name: 'chainpoint'
})

// CORS
// See : https://github.com/TabDigital/restify-cors-middleware
// See : https://github.com/restify/node-restify/issues/1151#issuecomment-271402858
//
// Test w/
//
// curl \
// --verbose \
// --request OPTIONS \
// http://127.0.0.1:8080/hashes \
// --header 'Origin: http://localhost:9292' \
// --header 'Access-Control-Request-Headers: Origin, Accept, Content-Type' \
// --header 'Access-Control-Request-Method: POST'
//
var cors = corsMiddleware({
  preflightMaxAge: 600,
  origins: ['*']
})
server.pre(cors.preflight)
server.use(cors.actual)

server.use(restify.queryParser())
server.use(restify.bodyParser())

// API RESOURCES
server.post({ path: '/hashes', version: '1.0.0' }, postHashesV1)
server.get({ path: '/proofs/:id', version: '1.0.0' }, getProofsByIDV1)
server.get({ path: '/', version: '1.0.0' }, rootV1)

// AMQP initialization
amqpOpenConnection(RABBITMQ_CONNECT_URI)

// SERVER
server.listen(8080, () => {
  console.log('%s listening at %s', server.name, server.url)
})

// export these functions for testing purposes
module.exports = {
  setAMQPChannel: (chan) => { amqpChannel = chan },
  server: server,
  generatePostHashesResponse: generatePostHashesResponse
}
