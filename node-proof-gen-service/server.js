const amqp = require('amqplib')
const chainpointProofSchema = require('chainpoint-proof-json-schema')

require('dotenv').config()

// the name of the RabbitMQ topic exchange to use
const RMQ_WORK_EXCHANGE_NAME = process.env.RMQ_WORK_EXCHANGE_NAME || 'work_topic_exchange'

// the topic exchange routing key for all message consumption originating from proof state services
const RMQ_WORK_IN_ROUTING_KEY = process.env.RMQ_WORK_IN_ROUTING_KEY || 'work.generator.*'

// the topic exchange routing key for cal generation message consumption originating from calendar service
const RMQ_WORK_IN_CAL_ROUTING_KEY = process.env.RMQ_WORK_IN_CAL_ROUTING_KEY || 'work.generator.cal'

// the topic exchange routing key for eth generation message consumption originating from ethereum anchor service
const RMQ_WORK_IN_ETH_ROUTING_KEY = process.env.RMQ_WORK_IN_ETH_ROUTING_KEY || 'work.generator.eth'

// the topic exchange routing key for btc generation message consumption originating from btc anchor service
const RMQ_WORK_IN_BTC_ROUTING_KEY = process.env.RMQ_WORK_IN_BTC_ROUTING_KEY || 'work.generator.btc'

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

/**
* Extracts and returns the timestamp embedded within a UUIDv1
*
* @param {string} uuid - The UUID v1 string from which to extract the timestamp
*/
function getTimestampFromUUIDv1 (uuid) {
  const GREGORIAN_OFFSET = 122192928000000000
  let uuidSegments = uuid.split('-')
  let hexTime = uuidSegments[2].substring(1).concat(uuidSegments[1], uuidSegments[0])
  let nanoGregorian = parseInt(hexTime, 16) // 100 nano second intervals since 00:00:00.00, 15 October 1582
  let nanoEpoch = nanoGregorian - GREGORIAN_OFFSET // 100 nano second intervals since 00:00:00.00, 01 January 1970
  let milliEpoch = Math.floor(nanoEpoch / 10000) // milliseconds since 00:00:00.00, 01 January 1970
  let timestamp = new Date(milliEpoch) // the Date object containing timestamp value with millisecond precision
  return timestamp
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
    console.error(RMQ_WORK_IN_CAL_ROUTING_KEY, 'consume message acked, but with invalid JSON schema error')
    return
  }

  console.log(JSON.stringify(proof))

  amqpChannel.ack(msg)
  console.log(RMQ_WORK_IN_CAL_ROUTING_KEY, 'consume message acked')
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
  proof.hash_submitted_at = formatDateISO8601NoMs(getTimestampFromUUIDv1(hashId))
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
    switch (msg.fields.routingKey) {
      case RMQ_WORK_IN_CAL_ROUTING_KEY:
        // Consumes a generate calendar proof message
        generateCALProof(msg)
        break
      case RMQ_WORK_IN_ETH_ROUTING_KEY:
        // Consumes a generate eth anchor proof message
        generateETHProof(msg)
        break
      case RMQ_WORK_IN_BTC_ROUTING_KEY:
        // Consumes a generate btc anchor proof message
        generateBTCProof(msg)
        break
      default:
        // This is an unknown state type, unknown routing key
        console.error('Unknown state type or routing key', msg.fields.routingKey)
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
  amqp.connect(connectionString).then(function (conn) {
    conn.on('close', () => {
      // if the channel closes for any reason, attempt to reconnect
      console.error('Connection to RMQ closed.  Reconnecting in 5 seconds...')
      // channel is lost, reset to null
      amqpChannel = null
      setTimeout(amqpOpenConnection.bind(null, connectionString), 5 * 1000)
    })
    conn.createConfirmChannel().then(function (chan) {
      // the connection and channel have been established
      // set 'amqpChannel' so that publishers have access to the channel
      console.log('Connection established')
      chan.assertExchange(RMQ_WORK_EXCHANGE_NAME, 'topic', { durable: true })
      amqpChannel = chan

      // Continuously load the HASHES from RMQ with hash objects to process
      return chan.assertQueue('', { durable: true }).then(function (q) {
        chan.bindQueue(q.queue, RMQ_WORK_EXCHANGE_NAME, RMQ_WORK_IN_ROUTING_KEY)
        return chan.consume(q.queue, function (msg) {
          processMessage(msg)
        })
      })
    })
  }).catch(() => {
    // catch errors when attempting to establish connection
    console.error('Cannot establish rmq connection. Attempting in 5 seconds...')
    setTimeout(amqpOpenConnection.bind(null, connectionString), 5 * 1000)
  })
}

// Open amqp connection
amqpOpenConnection(RABBITMQ_CONNECT_URI)
