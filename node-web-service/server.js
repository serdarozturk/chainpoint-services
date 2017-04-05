require('dotenv').config()
const _ = require('lodash')
const restify = require('restify')
const amqp = require('amqplib')

// Generate a v1 UUID (time-based)
// see: https://github.com/broofa/node-uuid
const uuidv1 = require('uuid/v1')

// The name of the RabbitMQ hash to push hashes for aggregation
const AGGREGATOR_INGRESS_QUEUE = process.env.AGGREGATOR_INGRESS_QUEUE || 'aggregator_ingress'

// Connection string w/ credentials for RabbitMQ
const RABBITMQ_CONNECT_URI = process.env.RABBITMQ_CONNECT_URI || 'amqp://chainpoint:chainpoint@rabbitmq'

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
  amqp.connect(connectionString).then(function (conn) {
    conn.on('close', () => {
      // if the channel closes for any reason, attempt to reconnect
      console.error('Connection to RMQ closed.  Reconnecting in 5 seconds...')
      amqpChannel = null
      setTimeout(amqpOpenConnection.bind(null, connectionString), 5 * 1000)
    })
    conn.createConfirmChannel().then(function (chan) {
      // the connection and channel have been established
      // set 'amqpChannel' so that publishers have access to the channel
      console.error('Connection established')
      amqpChannel = chan
    })
  }).catch(() => {
    // catch errors when attempting to establish connection
    console.error('Cannot establish connection. Attempting in 5 seconds...')
    setTimeout(amqpOpenConnection.bind(null, connectionString), 5 * 1000)
  })
}

/**
 * Test if a number is Even or Odd
 *
 * @param {number} n - The number to test
 * @returns {Boolean}
 */
function isEven (n) {
  return n === parseFloat(n) && !(n % 2)
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
  return hashes.map(function (hash) {
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
  metaDataObj.timestamp = formatDateISO8601NoMs(timestamp)

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
  let hashObjects = lcHashes.map(function (hash) {
    let hashObj = {}
    hashObj.id = uuidv1()
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
  if (!req.contentType() === 'application/json') {
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
  if (_.size(req.params.hashes) >= 1000) {
    return next(new restify.InvalidArgumentError('invalid JSON body, hashes Array max size exceeded'))
  }

  // validate hashes are individually well formed
  let containsValidHashes = _.every(req.params.hashes, function (hash) {
    return /^[a-fA-F0-9]{40,128}$/.test(hash) && isEven(hash.length)
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
  amqpChannel.sendToQueue(AGGREGATOR_INGRESS_QUEUE, new Buffer(JSON.stringify(responseObj)), { persistent: true },
    function (err, ok) {
      if (err !== null) {
        console.error('Message nacked')
        return next(new restify.InternalServerError('Message could not be delivered'))
      } else {
        console.log('Message acked')
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
function getProofByIDV1 (req, res, next) {
  // isUUID.v1()
  // uuidTime(v1)
  res.send({ proof: true })
  return next()
}

/**
 * GET / handler
 *
 * Root path handler with default message.
 *
 */
function rootV1 (req, res, next) {
  return next(new restify.ImATeapotError('This is an API endpoint. Please consult https://www.chainpoint.org'))
}

// RESTIFY
var server = restify.createServer({
  name: 'chainpoint'
})

server.use(restify.queryParser())
server.use(restify.bodyParser())

// API RESOURCES
server.post({ path: '/hashes', version: '1.0.0' }, postHashesV1)
server.post({ path: '/proofs', version: '1.0.0' }, getProofByIDV1)
server.get({ path: '/proofs/:id', version: '1.0.0' }, getProofByIDV1)
server.get({ path: '/', version: '1.0.0' }, rootV1)

// AMQP initialization
amqpOpenConnection(RABBITMQ_CONNECT_URI)

// SERVER
server.listen(8080, function () {
  console.log('%s listening at %s', server.name, server.url)
})
