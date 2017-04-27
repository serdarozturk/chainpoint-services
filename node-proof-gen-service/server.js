const amqp = require('amqplib/callback_api')
const chainpointProofSchema = require('chainpoint-proof-json-schema')
const async = require('async')
const uuidTime = require('uuid-time')

require('dotenv').config()

const REDIS_CONNECT_URI = process.env.REDIS_CONNECT_URI || 'redis://redis:6379'
const r = require('redis')
const redis = r.createClient(REDIS_CONNECT_URI)

// THE maximum number of messages sent over the channel that can be awaiting acknowledgement, 0 = no limit
const RMQ_PREFETCH_COUNT = process.env.RMQ_PREFETCH_COUNT || 0

// The queue name for message consumption originating from the proof state service
const RMQ_WORK_IN_QUEUE = process.env.RMQ_WORK_IN_QUEUE || 'work.gen'

// The queue name for outgoing message to the api service
const RMQ_WORK_OUT_QUEUE = process.env.RMQ_WORK_OUT_QUEUE || 'work.api'

// Connection string w/ credentials for RabbitMQ
const RABBITMQ_CONNECT_URI = process.env.RABBITMQ_CONNECT_URI || 'amqp://chainpoint:chainpoint@rabbitmq'

// The channel used for all amqp communication
// This value is set once the connection has been established
let amqpChannel = null

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

function generateCALProof (msg) {
  let messageObj = JSON.parse(msg.content.toString())

  let proof = {}
  proof = addChainpointHeader(proof, messageObj.hash, messageObj.hash_id)
  proof = addCalendarBranch(proof, messageObj.agg_state, messageObj.cal_state)

  // ensure the proof is valid according to the defined Chainpoint v3 JSON schema
  let isValidSchema = chainpointProofSchema.validate(proof).valid
  if (!isValidSchema) {
    // This schema is not valid, ack the message but log an error and end processing
    // We are not nacking here because the poorly formatted proof would just be
    // re-qeueud and re-processed on and on forever
    amqpChannel.ack(msg)
    console.error(RMQ_WORK_IN_QUEUE, 'consume message acked, but with invalid JSON schema error')
    return
  }

  var proofString = JSON.stringify(proof)

  async.series([
    // save proof to redis
    (callback) => {
      redis.set(messageObj.hash_id, proofString, (err, res) => {
        if (err) return callback(err)
        return callback(null)
      })
    },
    // publish 'ready' message for API service
    (callback) => {
      amqpChannel.sendToQueue(RMQ_WORK_OUT_QUEUE, Buffer.from(messageObj.hash_id), { persistent: true },
        (err, ok) => {
          if (err !== null) {
            // An error as occurred publishing a message
            console.error(RMQ_WORK_OUT_QUEUE, 'publish message nacked')
            return callback(err)
          } else {
            // New message has been published
            console.log(RMQ_WORK_OUT_QUEUE, 'publish message acked')
            return callback(null)
          }
        })
    }
  ],
    (err) => {
      if (err) {
        // An error has occurred saving the proof and publishing the ready message, nack consumption of message
        amqpChannel.nack(msg)
        console.error(RMQ_WORK_IN_QUEUE, '[cal] consume message nacked')
      } else {
        amqpChannel.ack(msg)
        console.log(RMQ_WORK_IN_QUEUE, '[cal] consume message acked')
      }
    })
}
function generateETHProof (msg) {
  console.log('building eth proof')
}
function generateBTCProof (msg) {
  console.log('building btc proof')
}

function addChainpointHeader (proof, hash, hashId) {
  proof['@context'] = 'https://w3id.org/chainpoint/v3'
  proof.type = 'Chainpoint'
  proof.hash = hash
  proof.hash_id = hashId
  proof.hash_submitted_at = formatDateISO8601NoMs(new Date(uuidTime.v1(hashId)))
  return proof
}

function addCalendarBranch (proof, aggState, calState) {
  let calendarBranch = {}
  calendarBranch.label = 'cal_anchor_branch'
  calendarBranch.ops = aggState.ops.concat(calState.ops)

  let calendarAnchor = {}
  calendarAnchor.type = 'cal'
  calendarAnchor.anchor_id = calState.anchor.anchor_id
  calendarAnchor.uris = calState.anchor.uris

  calendarBranch.ops.push({ anchors: [calendarAnchor] })

  proof.branches = [calendarBranch]
  return proof
}

/**
* Parses a message and performs the required work for that message
*
* @param {amqp message object} msg - The AMQP message received from the queue
*/
function processMessage (msg) {
  if (msg !== null) {
    // determine the source of the message and handle appropriately
    switch (msg.properties.type) {
      case 'cal':
        // Consumes a generate calendar proof message
        generateCALProof(msg)
        break
      case 'eth':
        // Consumes a generate eth anchor proof message
        generateETHProof(msg)
        break
      case 'btc':
        // Consumes a generate btc anchor proof message
        generateBTCProof(msg)
        break
      default:
        // This is an unknown state type
        console.error('Unknown state type', msg.properties.type)
    }
  }
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
        console.log('Connection established')
        chan.assertQueue(RMQ_WORK_IN_QUEUE, { durable: true })
        chan.assertQueue(RMQ_WORK_OUT_QUEUE, { durable: true })
        chan.prefetch(RMQ_PREFETCH_COUNT)
        amqpChannel = chan
        // Continuously load the HASHES from RMQ with hash objects to process
        chan.consume(RMQ_WORK_IN_QUEUE, (msg) => {
          processMessage(msg)
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

// Open amqp connection
amqpOpenConnection(RABBITMQ_CONNECT_URI)
