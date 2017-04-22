const amqp = require('amqplib')
const async = require('async')
const _ = require('lodash')

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

function generateCALProof (msg) {
  let messageObj = JSON.parse(msg.content.toString())

  let proof = {}
  proof = addChainpointHeader(proof, messageObj.hash, messageObj.hash_id)
  proof = addCalendarBranch(proof, messageObj.agg_state, messageObj.cal_state)

  console.log(JSON.stringify(proof))

  amqpChannel.ack(msg)
  console.error(RMQ_WORK_IN_CAL_ROUTING_KEY, 'consume message acked')
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

  // TODO find an npm package that does this, or at least clean this up and explain it
  // Parsing timestamp our of UUID v1
  // Adapted from https://github.com/xehrad/UUID_to_Date/blob/master/UUID_to_Date.js
  // fda9a5e0-26d6-11e7-b437-d3889624c9fd
  const GREGORIAN_OFFSET = 122192928000000000
  let uuidArray = hashId.split('-')
  let timeString = [
    uuidArray[2].substring(1), // 1e7
    uuidArray[1], // 26d6
    uuidArray[0] // fda9a5e0
  ].join('')
  let nanoGregorian = parseInt(timeString, 16) // 100 nano second intervals since 00:00:00.00, 15 October 1582
  let nanoEpoch = nanoGregorian - GREGORIAN_OFFSET // 100 nano second intervals since 00:00:00.00, 01 January 1970
  let milliEpoch = Math.floor(nanoEpoch / 10000) // milliseconds since 00:00:00.00, 01 January 1970
  let hashDate = new Date(milliEpoch)

  // TODO Remove millisecond component from timestamp?
  proof.hash_submitted_at = hashDate
  return proof
}

function addCalendarBranch (proof, aggState, calState) {
  let calendarBranch = {}
  calendarBranch.label = 'root_branch'
  calendarBranch.ops = aggState.ops.concat(calState.ops)

  let calendarAnchor = {}
  calendarAnchor.type = 'cal'
  calendarAnchor.anchor_id = calState.anchor.anchor_id
  calendarAnchor.uris = calState.anchor.uris

  calendarBranch.anchors = [calendarAnchor]

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
        // Stores state information and publishes message bound for Generator
        generateETHProof(msg)
        break
      case RMQ_WORK_IN_BTC_ROUTING_KEY:
        // Consumes a generate btc anchor proof message
        // Stores state information and publishes message bound for Generator
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
