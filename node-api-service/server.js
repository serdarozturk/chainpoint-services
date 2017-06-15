const _ = require('lodash')
const restify = require('restify')
const corsMiddleware = require('restify-cors-middleware')
const amqp = require('amqplib/callback_api')
const async = require('async')
const uuidTime = require('uuid-time')
const webSocket = require('ws')
const chpBinary = require('chainpoint-binary')
const chpParse = require('chainpoint-parse')

const calendarBlock = require('./lib/models/CalendarBlock.js')

// load all environment variables into env object
const env = require('./lib/parse-env.js')('api')

const r = require('redis')

// Generate a v1 UUID (time-based)
// see: https://github.com/broofa/node-uuid
const uuidv1 = require('uuid/v1')

const uuidValidate = require('uuid-validate')

// The custom MIME type for JSON proof array results containing Base64 encoded proof data
const BASE64_MIME_TYPE = 'application/vnd.chainpoint.json+base64'

// The custom MIME type for JSON proof array results containing Base64 encoded proof data
const JSONLD_MIME_TYPE = 'application/vnd.chainpoint.ld+json'

// Set a unique identifier for this instance of API Service
// This is used to associate API Service instances with websocket connections
const APIServiceInstanceId = uuidv1()

// Initial an object that will hold all open websocket connections
let WebSocketConnections = {}

// The channel used for all amqp communication
// This value is set once the connection has been established
// API methods should return 502 when this value is null
var amqpChannel = null

// The redis connection used for all redis communication
// This value is set once the connection has been established
let redis = null

// pull in variables defined in shared CalendarBlock module
let sequelize = calendarBlock.sequelize
let CalendarBlock = calendarBlock.CalendarBlock

/**
 * Opens a Redis connection
 *
 * @param {string} connectionString - The connection string for the Redis instance, an Redis URI
 */
function openRedisConnection (redisURI) {
  redis = r.createClient(redisURI)
  redis.on('error', () => {
    redis.quit()
    redis = null
    console.error('Cannot connect to Redis. Attempting in 5 seconds...')
    setTimeout(openRedisConnection.bind(null, redisURI), 5 * 1000)
  })
  redis.on('ready', () => {
    console.log('Redis connected')
  })
}

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
        console.log('RabbitMQ connection established')
        chan.assertQueue(env.RMQ_WORK_OUT_SPLITTER_QUEUE, { durable: true })
        chan.prefetch(env.RMQ_PREFETCH_COUNT_API)
        amqpChannel = chan

        chan.assertExchange(env.RMQ_INCOMING_EXCHANGE, 'headers', { durable: true })
        chan.assertQueue('', { durable: true }, (err, q) => {
          if (err) return callback(err)
          // Continuously load the HASHES from RMQ with proof ready hash objects to process)
          let opts = { 'api_id': APIServiceInstanceId, 'x-match': 'all' }
          chan.bindQueue(q.queue, env.RMQ_INCOMING_EXCHANGE, '', opts)
          chan.consume(q.queue, (msg) => {
            processProofMessage(msg)
          })
        })
        return callback(null)
      })
    }
  ], (err) => {
    if (err) {
      // catch errors when attempting to establish connection
      console.error('Cannot establish RabbitMQ connection. Attempting in 5 seconds...')
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
    let proofReadyObj = JSON.parse(msg.content.toString())

    async.waterfall([
      (callback) => {
        // get the target websocket if it is on this instance, otherwise null
        let targetWebsocket = WebSocketConnections[proofReadyObj.cx_id] || null
        // if the target websocket is not on this instance, there is no work to do, return
        if (targetWebsocket === null) return callback(null)
        // get the proof for the given hashId
        redis.get(proofReadyObj.hash_id, (err, proofBase64) => {
          if (err) return callback(err)
          // if proof is not found, return null to skip the rest of the process
          if (proofBase64 == null) return callback(null)
          // deliver proof over websocket if websocket was found on this instance
          let proofResponse = {
            hash_id: proofReadyObj.hash_id,
            proof: proofBase64
          }
          targetWebsocket.send(JSON.stringify(proofResponse))
          return callback(null)
        })
      }
    ], (err) => {
      if (err) {
        console.error(err)
        amqpChannel.ack(msg)
        console.log(env.RMQ_WORK_IN_API_QUEUE, 'consume message acked')
      } else {
        amqpChannel.ack(msg)
        console.log(env.RMQ_WORK_IN_API_QUEUE, 'consume message acked')
      }
    })
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

  // FIXME : Calculate these based on last anchor time and known interval?
  metaDataObj.processing_hints = {
    cal: formatDateISO8601NoMs(addMinutes(timestamp, 1)),
    eth: formatDateISO8601NoMs(addMinutes(timestamp, 41)),
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
  if (_.size(req.params.hashes) > env.POST_HASHES_MAX) {
    return next(new restify.InvalidArgumentError(`invalid JSON body, hashes Array max size of ${env.POST_HASHES_MAX} exceeded`))
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
  amqpChannel.sendToQueue(env.RMQ_WORK_OUT_SPLITTER_QUEUE, Buffer.from(JSON.stringify(responseObj)), { persistent: true },
    (err, ok) => {
      if (err !== null) {
        console.error(env.RMQ_WORK_OUT_SPLITTER_QUEUE, 'publish message nacked')
        return next(new restify.InternalServerError('Message could not be delivered'))
      } else {
        console.log(env.RMQ_WORK_OUT_SPLITTER_QUEUE, 'publish message acked')
      }
    })

  res.send(responseObj)
  return next()
}
/**
 * GET /proofs/:hash_id handler
 *
 * Expects a path parameter 'hash_id' in the form of a Version 1 UUID
 *
 * Returns a chainpoint proof for the requested Hash ID
 */
function getProofsByIDV1 (req, res, next) {
  let hashIdResults = []

  // check if hash_id parameter was included
  if (req.params && req.params.hash_id) {
    // a hash_id was specified in the url, so use that hash_id only

    if (!uuidValidate(req.params.hash_id, 1)) {
      return next(new restify.InvalidArgumentError('invalid request, bad hash_id'))
    }

    hashIdResults.push(req.params.hash_id)
  } else if (req.headers && req.headers.hashids) {
    // no hash_id was specified in url, read from headers.hashids
    hashIdResults = req.headers.hashids.split(',')
  }

  // ensure at least one hash_id was submitted
  if (hashIdResults.length === 0) {
    return next(new restify.InvalidArgumentError('invalid request, at least one hash id required'))
  }

  // ensure that the request count does not exceed the maximum setting
  if (hashIdResults.length > env.GET_PROOFS_MAX_REST) {
    return next(new restify.InvalidArgumentError('invalid request, too many hash ids (' + env.GET_PROOFS_MAX_REST + ' max)'))
  }

  // prepare results array to hold proof results
  hashIdResults = hashIdResults.map((hashId) => {
    return { hash_id: hashId.trim(), proof: null }
  })
  let requestedType = req.accepts(JSONLD_MIME_TYPE) ? JSONLD_MIME_TYPE : BASE64_MIME_TYPE
  console.log(req.accepts(requestedType))

  async.eachLimit(hashIdResults, 50, (hashIdResult, callback) => {
    // validate id param is proper UUIDv1
    if (!uuidValidate(hashIdResult.hash_id, 1)) return callback(null)
    // validate uuid time is in in valid range
    let uuidEpoch = uuidTime.v1(hashIdResult.hash_id)
    var nowEpoch = new Date().getTime()
    let uuidDiff = nowEpoch - uuidEpoch
    let maxDiff = env.PROOF_EXPIRE_MINUTES * 60 * 1000
    if (uuidDiff > maxDiff) return callback(null)
    // retrieve proof from storage
    redis.get(hashIdResult.hash_id, (err, proofBase64) => {
      if (err) return callback(null)
      if (requestedType === BASE64_MIME_TYPE) {
        hashIdResult.proof = proofBase64
        return callback(null)
      } else {
        chpBinary.binaryToObject(proofBase64, (err, proofObj) => {
          if (err) return callback(null)
          hashIdResult.proof = proofObj
          return callback(null)
        })
      }
    })
  }, (err) => {
    if (err) return next(new restify.InternalError(err))
    res.contentType = 'application/json'
    res.send(hashIdResults)
    return next()
  })
}

/**
 * POST /verify handler
 *
 * Expects a JSON body with the form:
 *   {"proofs": [ {proofJSON1}, {proofJSON2}, {proofJSON3} ]}
 *   or
 *   {"proofs": [ "proof binary 1", "proof binary 2", "proof binary 3" ]}
 *
 * The `proofs` key must reference a JSON Array of chainpoint proofs.
 * Proofs may be in either JSON form or base64 encoded binary form.
 *
 */
function postProofsForVerificationV1 (req, res, next) {
  // validate content-type sent was 'application/json'
  if (req.contentType() !== 'application/json') {
    return next(new restify.InvalidArgumentError('invalid content type'))
  }

  // validate params has parse a 'proofs' key
  if (!req.params.hasOwnProperty('proofs')) {
    return next(new restify.InvalidArgumentError('invalid JSON body, missing proofs'))
  }

  // validate proofs param is an Array
  if (!_.isArray(req.params.proofs)) {
    return next(new restify.InvalidArgumentError('invalid JSON body, proofs is not an Array'))
  }

  // validate proofs param Array has at least one hash
  if (_.size(req.params.proofs) < 1) {
    return next(new restify.InvalidArgumentError('invalid JSON body, proofs Array is empty'))
  }

  // validate proofs param Array is not larger than allowed max length
  if (_.size(req.params.proofs) > env.POST_VERIFY_PROOFS_MAX) {
    return next(new restify.InvalidArgumentError(`invalid JSON body, proofs Array max size of ${env.POST_VERIFY_PROOFS_MAX} exceeded`))
  }

  let verifyTasks = BuildVerifyTaskList(req.params.proofs)
  ProcessVerifyTasks(verifyTasks, (err, verifyResults) => {
    if (err) {
      console.error(err)
      return next(new restify.InternalError('internal error verifying proof(s)'))
    }
    res.send(verifyResults)
    return next()
  })
}

function confirmExpectedValue (anchorInfo, callback) {
  let anchorId = anchorInfo.anchor_id
  let expectedValue = anchorInfo.expected_value
  switch (anchorInfo.type) {
    case 'cal':
      CalendarBlock.findOne({ where: { type: 'cal', data_id: anchorId }, attributes: ['hash'] }).then(block => {
        if (block) {
          return callback(null, block.hash === expectedValue)
        } else {
          return callback(null, false)
        }
      }).catch((err) => {
        return callback(err)
      })
      break
    case 'btc':
      CalendarBlock.findOne({ where: { type: 'btc-c', dataId: anchorId }, attributes: ['dataVal'] }).then(block => {
        if (block) {
          console.log(JSON.stringify(block))
          let blockRoot = block.dataVal.match(/.{2}/g).reverse().join('')
          return callback(null, blockRoot === expectedValue)
        } else {
          return callback(null, false)
        }
      }).catch((err) => {
        return callback(err)
      })
      break
    case 'eth':
      break
  }
}

function ProcessVerifyTasks (verifyTasks, callback) {
  let processedTasks = []

  async.eachSeries(verifyTasks, (verifyTask, eachCallback) => {
    let status = verifyTask.status
    if (status === 'malformed') {
      processedTasks.push({
        proof_index: verifyTask.proof_index,
        status: status
      })
      return eachCallback(null)
    }

    let anchors = []
    let totalCount = 0
    let validCount = 0

    async.mapSeries(verifyTask.anchors, (anchor, mapCallback) => {
      confirmExpectedValue(anchor.anchor, (err, result) => {
        if (err) return mapCallback(err)
        let anchorResult = {
          branch: anchor.branch || undefined,
          type: anchor.anchor.type,
          valid: result
        }
        totalCount++
        validCount = validCount + (anchorResult.valid === true ? 1 : 0)
        return mapCallback(null, anchorResult)
      })
    }, (err, anchorResults) => {
      if (err) {
        console.error('verification error - ' + err)
      } else {
        anchors = anchors.concat(anchorResults)
        if (validCount === 0) {
          status = 'invalid'
        } else if (validCount === totalCount) {
          status = 'verified'
        } else {
          status = 'mixed'
        }

        let result = {
          proof_index: verifyTask.proof_index,
          hash_id: verifyTask.hash_id,
          hash: verifyTask.hash,
          hash_submitted_at: verifyTask.hash_submitted_at,
          anchors: anchors,
          status: status
        }
        processedTasks.push(result)
        return eachCallback(null)
      }
    })
  }, (err) => {
    if (err) return callback(err)
    return callback(null, processedTasks)
  })
}

function BuildVerifyTaskList (proofs) {
  let results = []
  let proofIndex = 0
  let parseObj = null
  // extract id, time, anchors, and calculate expected values
  _.forEach(proofs, function (proof) {
    if (typeof (proof) === 'string') { // then this should be a binary proof
      chpParse.parseBinary(proof, function (err, result) {
        if (!err) parseObj = result
      })
    } else if (typeof (proof) === 'object') { // then this should be a JSON proof
      chpParse.parseObject(proof, function (err, result) {
        if (!err) parseObj = result
      })
    }

    let hashId = parseObj !== null ? parseObj.hash_id : undefined
    let hash = parseObj !== null ? parseObj.hash : undefined
    let hashSubmittedAt = parseObj !== null ? parseObj.hash_submitted_at : undefined
    let expectedValues = parseObj !== null ? flattenExpectedValues(parseObj.branches) : undefined

    results.push({
      proof_index: proofIndex++,
      hash_id: hashId,
      hash: hash,
      hash_submitted_at: hashSubmittedAt,
      anchors: expectedValues,
      status: parseObj === null ? 'malformed' : ''
    })
  })
  return results
}

function flattenExpectedValues (branchArray) {
  let results = []
  for (let b = 0; b < branchArray.length; b++) {
    let anchors = branchArray[b].anchors
    if (anchors.length > 0) {
      for (let a = 0; a < anchors.length; a++) {
        results.push({
          branch: branchArray[b].label || undefined,
          anchor: anchors[a]
        })
      }
    }
    if (branchArray[b].branches) {
      results = results.concat(flattenExpectedValues(branchArray[b].branches))
    }
    return results
  }
}

/**
 * GET /calendar/:height handler
 *
 * Expects a path parameter 'height' as an integer
 *
 * Returns a calendar block by calendar height
 */
function getCalBlockByHeightV1 (req, res, next) {
  let height = parseInt(req.params.height, 10)

  // ensure that :height is an integer
  if (!_.isInteger(height) || height < 0) {
    return next(new restify.InvalidArgumentError('invalid request, height must be a positive integer'))
  }

  CalendarBlock.findOne({ where: { id: height } }).then(block => {
    if (block) {
      res.contentType = 'application/json'
      // getting the plain object allows id conversion to int below
      block = block.get({ plain: true })
      block.id = parseInt(block.id, 10)
      block.time = parseInt(block.time, 10)
      block.version = parseInt(block.version, 10)
      res.send(block)
      return next()
    } else {
      return next(new restify.NotFoundError())
    }
  }).catch((err) => {
    console.error(err)
    return next(new restify.InternalError(err))
  })
}

/**
 * GET /calendar/:fromHeight/:toHeight handler
 *
 * Expects path parameters 'fromHeight' and 'topHeight' as an integers
 *
 * Returns an array of calendar blocks
 */
function getCalBlockRangeV1 (req, res, next) {
  let fromHeight = parseInt(req.params.fromHeight, 10)
  let toHeight = parseInt(req.params.toHeight, 10)

  // ensure that :fromHeight is an integer
  if (!_.isInteger(fromHeight) || fromHeight < 0) {
    return next(new restify.InvalidArgumentError('invalid request, fromHeight must be a positive integer'))
  }
  // ensure that :toHeight is an integer
  if (!_.isInteger(toHeight) || toHeight < 0) {
    return next(new restify.InvalidArgumentError('invalid request, toHeight must be a positive integer'))
  }
  // ensure that :toHeight is greater or equal to :fromHeight
  if (toHeight < fromHeight) {
    return next(new restify.InvalidArgumentError('invalid request, toHeight must be greater or equal to fromHeight'))
  }
  // ensure the requested range does not exceed GET_CALENDAR_BLOCKS_MAX
  if ((toHeight - fromHeight + 1) > env.GET_CALENDAR_BLOCKS_MAX) {
    return next(new restify.InvalidArgumentError(`invalid request, requested range may not exceed ${env.GET_CALENDAR_BLOCKS_MAX} blocks`))
  }

  async.waterfall([
    (callback) => {
      CalendarBlock.findOne({ attributes: ['id'], order: 'id DESC' }).then(lastBlock => {
        if (lastBlock) {
          // getting the plain object allows id conversion to int below
          lastBlock = lastBlock.get({ plain: true })
          lastBlock.id = parseInt(lastBlock.id, 10)
          return callback(null, lastBlock.id)
        } else {
          return callback('notfound')
        }
      }).catch((err) => {
        return callback(err)
      })
    },
    (blockHeight, callback) => {
      CalendarBlock.findAll({ where: { id: { $between: [fromHeight, toHeight] } }, order: 'id ASC' }).then(blocks => {
        if (blocks.length) {
          // getting the plain object allows id conversion to int below
          let results = {}
          results.blocks = blocks
          results.start = fromHeight
          results.end = toHeight
          results.height = blockHeight
          return callback(null, results)
        } else {
          return callback('notfound')
        }
      }).catch((err) => {
        return callback(err)
      })
    }
  ], (err, results) => {
    if (err) {
      console.error(err)
      return next(new restify.InternalError(err))
    }
    res.send(results)
    return next()
  })
}

/**
 * GET /calendar/:height/data handler
 *
 * Expects a path parameter 'height' as an integer
 *
 * Returns dataVal item for calendar block by calendar height
 */
function getCalBlockDataByHeightV1 (req, res, next) {
  let height = parseInt(req.params.height, 10)

  // ensure that :height is an integer
  if (!_.isInteger(height) || height < 0) {
    return next(new restify.InvalidArgumentError('invalid request, height must be a positive integer'))
  }

  CalendarBlock.findOne({ where: { id: height }, attributes: ['dataVal'] }).then(result => {
    if (result) {
      res.contentType = 'text/plain'
      res.send(result.dataVal)
      return next()
    } else {
      return next(new restify.NotFoundError())
    }
  }).catch((err) => {
    console.error(err)
    return next(new restify.InternalError(err))
  })
}

/**
 * GET /calendar/:height/data handler
 *
 * Expects a path parameter 'height' as an integer
 *
 * Returns dataVal item for calendar block by calendar height
 */
function getCalBlockHashByHeightV1 (req, res, next) {
  let height = parseInt(req.params.height, 10)

  // ensure that :height is an integer
  if (!_.isInteger(height) || height < 0) {
    return next(new restify.InvalidArgumentError('invalid request, height must be a positive integer'))
  }

  CalendarBlock.findOne({ where: { id: height }, attributes: ['hash'] }).then(result => {
    if (result) {
      res.contentType = 'text/plain'
      res.send(result.hash)
      return next()
    } else {
      return next(new restify.NotFoundError())
    }
  }).catch((err) => {
    console.error(err)
    return next(new restify.InternalError(err))
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

function subscribeForProofs (ws, wsConnectionId, hashIds) {
  // build an array of hash_ids, ignoring any hash_ids above the GET_PROOFS_MAX_WS limit
  let hashIdResults = hashIds.split(',').slice(0, env.GET_PROOFS_MAX_WS).map((hashId) => {
    return { hash_id: hashId.trim(), proof: null }
  })

  async.eachLimit(hashIdResults, 50, (hashIdResult, callback) => {
    // validate id param is proper UUIDv1
    let isValidUUID = uuidValidate(hashIdResult.hash_id, 1)
    // validate uuid time is in in valid range
    let uuidEpoch = uuidTime.v1(hashIdResult.hash_id)
    var nowEpoch = new Date().getTime()
    let uuidDiff = nowEpoch - uuidEpoch
    let maxDiff = env.PROOF_EXPIRE_MINUTES * 60 * 1000
    let uuidValidTime = (uuidDiff <= maxDiff)
    if (isValidUUID && uuidValidTime) {
      createProofSubscription(APIServiceInstanceId, wsConnectionId, hashIdResult.hash_id, (err, proofBase64) => {
        if (err) return callback(err)
        if (proofBase64 !== null) {
          let proofResponse = {
            hash_id: hashIdResult.hash_id,
            proof: proofBase64
          }
          ws.send(JSON.stringify(proofResponse))
        }
        callback(null)
      })
    }
  }, (err) => {
    if (err) console.error(err)
  })
}

function createProofSubscription (APIServiceInstanceId, wsConnectionId, hashId, callback) {
  async.waterfall([
    (wfCallback) => {
      // create redis entry for hash subscription, storing the instance ID and ws connection id
      // The id's reference the request's origin, and are used to target the response to the correct instance and connection
      // Preface the sub key with 'sub:' so as not to conflict with the proof storage, which uses the plain hashId as the key already
      let key = 'sub:' + hashId
      redis.hmset(key, ['api_id', APIServiceInstanceId, 'cx_id', wsConnectionId], (err, res) => {
        if (err) return wfCallback(err)
        return wfCallback(null, key)
      })
    },
    (key, wfCallback) => {
      // set the subscription to expire after 24 hours have passed
      redis.expire(key, 24 * 60 * 60, (err, res) => {
        if (err) return wfCallback(err)
        return wfCallback(null)
      })
    },
    (wfCallback) => {
      // look up proof for given hashId and return if it exists
      redis.get(hashId, (err, proofBase64) => {
        if (err) return wfCallback(err)
        // proofBase64 will either be a proof Base64 string or null
        return wfCallback(null, proofBase64)
      })
    }
  ],
    (err, proofBase64) => {
      if (err) return callback(err)
      return callback(null, proofBase64)
    })
}

// RESTIFY SETUP
// 'version' : all routes will default to this version
var server = restify.createServer({
  name: 'chainpoint',
  version: '1.0.0'
})

// Create a WS server to run in association with the Restify server
var webSocketServer = new webSocket.Server({ server: server.server })
// Handle new web socket connections
webSocketServer.on('connection', (ws) => {
  // set up ping to keep connection open over long periods of inactivity
  let pingInterval = setInterval(() => { ws.ping('ping') }, 1000 * 45)
  // retrieve the unique identifier for this connection
  let wsConnectionId = ws.upgradeReq.headers['sec-websocket-key']
  // save this connection to the open connection registry
  WebSocketConnections[wsConnectionId] = ws
  // when a message is received, process it as a subscription request
  ws.on('message', (hashIds) => subscribeForProofs(ws, wsConnectionId, hashIds))
  // when a connection closes, remove it from the open connection registry
  ws.on('close', () => {
    // remove this connection from the open connections object
    delete WebSocketConnections[wsConnectionId]
    // remove ping interval
    clearInterval(pingInterval)
  })
  ws.on('error', (e) => console.error(e))
})

// Clean up sloppy paths like //todo//////1//
server.pre(restify.pre.sanitizePath())

// Checks whether the user agent is curl. If it is, it sets the
// Connection header to "close" and removes the "Content-Length" header
// See : http://restify.com/#server-api
server.pre(restify.pre.userAgentConnection())

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

server.use(restify.gzipResponse())
server.use(restify.queryParser())
server.use(restify.bodyParser({
  maxBodySize: env.MAX_BODY_SIZE
}))

// API RESOURCES

// submit hash(es)
server.post({ path: '/hashes', version: '1.0.0' }, postHashesV1)
// get a single proof with a single hash_id
server.get({ path: '/proofs/:hash_id', version: '1.0.0' }, getProofsByIDV1)
// get multiple proofs with 'hashids' header param
server.get({ path: '/proofs', version: '1.0.0' }, getProofsByIDV1)
// verify one or more proofs
server.post({ path: '/verify', version: '1.0.0' }, postProofsForVerificationV1)
// get the block hash for the calendar at the specified hieght
server.get({ path: '/calendar/:height/hash', version: '1.0.0' }, getCalBlockHashByHeightV1)
// get the dataVal item for the calendar at the specified hieght
server.get({ path: '/calendar/:height/data', version: '1.0.0' }, getCalBlockDataByHeightV1)
// get the block object for the calendar at the specified hieght
server.get({ path: '/calendar/:height', version: '1.0.0' }, getCalBlockByHeightV1)
// get the block objects for the calendar in the specified range, incusive
server.get({ path: '/calendar/:fromHeight/:toHeight', version: '1.0.0' }, getCalBlockRangeV1)
// teapot
server.get({ path: '/', version: '1.0.0' }, rootV1)

// Instruct REST server to begin listening for request
function startListening () {
  // SERVER
  server.listen(8080, () => {
    console.log('%s listening at %s', server.name, server.url)
  })
}

/**
 * Opens a storage connection
 **/
function openStorageConnection (callback) {
  // Confirm connection to DB
  sequelize.authenticate()
    .then(() => {
      console.log('Connection to database has been established successfully.')
      return callback(null)
    })
    .catch(err => {
      console.error('Unable to connect to the database:', err)
      setTimeout(openStorageConnection.bind(null, callback), 5 * 1000)
    })
}

function initConnectionsAndStart () {
  if (env.NODE_ENV === 'test') return
  // Open storage connection and then amqp connection
  openStorageConnection((err, result) => {
    if (err) {
      console.error(err)
    } else {
      // AMQP initialization
      amqpOpenConnection(env.RABBITMQ_CONNECT_URI)
      // REDIS initialization
      openRedisConnection(env.REDIS_CONNECT_URI)
      // Init intervals and watches
      startListening()
    }
  })
}

// start the whole show here
// first open the required connections, then listen for requests
initConnectionsAndStart()

// export these functions for testing purposes
module.exports = {
  setAMQPChannel: (chan) => { amqpChannel = chan },
  setRedis: (redisClient) => { redis = redisClient },
  server: server,
  generatePostHashesResponse: generatePostHashesResponse
}
