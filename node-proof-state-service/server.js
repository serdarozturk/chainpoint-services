const _ = require('lodash')
const amqp = require('amqplib')

require('dotenv').config()

// Generate a v1 UUID (time-based)
// see: https://github.com/broofa/node-uuid
const uuidv1 = require('uuid/v1')

// the name of the RabbitMQ topic exchange to use
const RMQ_WORK_EXCHANGE_NAME = process.env.RMQ_WORK_EXCHANGE_NAME || 'work_topic_exchange'

// the topic exchange routing key for message consumption originating from all other services
const RMQ_WORK_IN_ROUTING_KEY = process.env.RMQ_WORK_IN_ROUTING_KEY || 'work.*.state'

// the topic exchange routing key for message consumption originating from splitter service
const RMQ_WORK_IN_SPLITTER_ROUTING_KEY = process.env.RMQ_WORK_IN_ROUTING_KEY || 'work.splitter.state'

// the topic exchange routing key for message consumption originating from aggregator service
const RMQ_WORK_IN_AGG_0_ROUTING_KEY = process.env.RMQ_WORK_IN_AGG_0_ROUTING_KEY || 'work.agg_0.state'

// the topic exchange routing key for message consumption originating from calendar service
const RMQ_WORK_IN_CAL_ROUTING_KEY = process.env.RMQ_WORK_IN_CAL_ROUTING_KEY || 'work.cal.state'

// the topic exchange routing key for message consumption originating from ethereum anchor service
const RMQ_WORK_IN_ETH_ROUTING_KEY = process.env.RMQ_WORK_IN_ETH_ROUTING_KEY || 'work.eth.state'

// the topic exchange routing key for message consumption originating from btc anchor service
const RMQ_WORK_IN_BTC_ROUTING_KEY = process.env.RMQ_WORK_IN_BTC_ROUTING_KEY || 'work.btc.state'

// the topic exchange routing key for message publishing bound for the aggregator service
const RMQ_WORK_OUT_AGGREGATOR_0_ROUTING_KEY = process.env.RMQ_WORK_OUT_AGGREGATOR_0_ROUTING_KEY || 'work.agg_0'

// the topic exchange routing key for message publishing bound for the calendar service
const RMQ_WORK_OUT_CAL_ROUTING_KEY = process.env.RMQ_WORK_OUT_CAL_ROUTING_KEY || 'work.cal'

// the topic exchange routing key for message publishing bound for the proof generation service for calendar generation
const RMQ_WORK_OUT_CAL_GEN_ROUTING_KEY = process.env.RMQ_WORK_OUT_CAL_GEN_ROUTING_KEY || 'work.generator.cal'

// the topic exchange routing key for message publishing bound for the eth anchor service
const RMQ_WORK_OUT_ETH_ROUTING_KEY = process.env.RMQ_WORK_OUT_ETH_ROUTING_KEY || 'work.eth'

// the topic exchange routing key for message publishing bound for the proof generation service for eth anchor generation
const RMQ_WORK_OUT_ETH_GEN_ROUTING_KEY = process.env.RMQ_WORK_OUT_ETH_GEN_ROUTING_KEY || 'work.generator.eth'

// the topic exchange routing key for message publishing bound for the btc anchor service
const RMQ_WORK_OUT_BTC_ROUTING_KEY = process.env.RMQ_WORK_OUT_BTC_ROUTING_KEY || 'work.btc'

// the topic exchange routing key for message publishing bound for the proof generation service for btc anchor generation
const RMQ_WORK_OUT_BTC_GEN_ROUTING_KEY = process.env.RMQ_WORK_OUT_BTC_GEN_ROUTING_KEY || 'work.generator.btc'

// Connection string w/ credentials for RabbitMQ
const RABBITMQ_CONNECT_URI = process.env.RABBITMQ_CONNECT_URI || 'amqp://chainpoint:chainpoint@rabbitmq'
// The channel used for all amqp communication
// This value is set once the connection has been established
var amqpChannel = null

/**
 * Consumes a message from the Splitter service
 * Stores state information and publishes message bound for aggregation service
 *
 * @param {amqp message object} msg - The AMQP message received from the queue
 */
function processSplitterWork (msg) {
  let messageObj = JSON.parse(msg.content.toString())
  let stateObj = {}
  stateObj.state_id = uuidv1()
  stateObj.hash_id = messageObj.hash_id
  stateObj.type = 'splitter'
  stateObj.state = messageObj.state
  console.log(stateObj)

  // TODO: Store this state information in DB/Redis/??

  // Publish the hash for consumption by the aggregator service
  let hashObj = {}
  hashObj.hash_id = messageObj.hash_id
  hashObj.hash = messageObj.state.hash
  amqpChannel.publish(RMQ_WORK_EXCHANGE_NAME, RMQ_WORK_OUT_AGGREGATOR_0_ROUTING_KEY, new Buffer(JSON.stringify(hashObj)), { persistent: true },
    function (err, ok) {
      if (err !== null) {
        console.error(RMQ_WORK_OUT_AGGREGATOR_0_ROUTING_KEY, 'publish message nacked')
         // An error as occurred publishing a message, nack consumption of original message
        console.error(msg.fields.routingKey, 'consume message nacked')
        amqpChannel.nack(msg)
      } else {
        console.log(RMQ_WORK_OUT_AGGREGATOR_0_ROUTING_KEY, 'publish message acked')
         // New message has been published, ack consumption of original message
        console.log(msg.fields.routingKey, 'consume message acked')
        amqpChannel.ack(msg)
      }
    })
}

/**
 * Consumes a message from the Aggregator service
 * Stores state information and publishes message bound for Calendar service
 *
 * @param {amqp message object} msg - The AMQP message received from the queue
 */
function processAggregatorWork (msg) {
  let messageObj = JSON.parse(msg.content.toString())
  let stateObj = {}
  stateObj.state_id = uuidv1()
  stateObj.hash_id = messageObj.hash_id
  stateObj.type = 'agg_0'
  stateObj.state = messageObj.state
  console.log(stateObj)

  // TODO: Store this state information in DB/Redis/??

  // TODO: Handle remaining messaging tasks
}

/**
 * Consumes a message from the Calendar service
 * Stores state information and publishes message bound for Generator, Eth Anchor and Btc service
 *
 * @param {amqp message object} msg - The AMQP message received from the queue
 */
function processCalWork (msg) {
  let messageObj = JSON.parse(msg.content.toString())
  let stateObj = {}
  stateObj.state_id = uuidv1()
  stateObj.hash_id = messageObj.hash_id
  stateObj.type = 'cal'
  stateObj.state = messageObj.state
  console.log(stateObj)

  // TODO: Store this state information in DB/Redis/??

  // TODO: Handle remaining messaging tasks
}

/**
 * Consumes a message from the Eth Anchor service
 * Stores state information and publishes message bound for Generator
 *
 * @param {amqp message object} msg - The AMQP message received from the queue
 */
function processEthWork (msg) {
  let messageObj = JSON.parse(msg.content.toString())
  let stateObj = {}
  stateObj.state_id = uuidv1()
  stateObj.hash_id = messageObj.hash_id
  stateObj.type = 'eth'
  stateObj.state = messageObj.state
  console.log(stateObj)

  // TODO: Store this state information in DB/Redis/??

  // TODO: Handle remaining messaging tasks
}

/**
 * Consumes a message from the Calendar service
 * Stores state information and publishes message bound for Generator
 *
 * @param {amqp message object} msg - The AMQP message received from the queue
 */
function processBtcWork (msg) {
  let messageObj = JSON.parse(msg.content.toString())
  let stateObj = {}
  stateObj.state_id = uuidv1()
  stateObj.hash_id = messageObj.hash_id
  stateObj.type = 'btc'
  stateObj.state = messageObj.state
  console.log(stateObj)

  // TODO: Store this state information in DB/Redis/??

  // TODO: Handle remaining messaging tasks
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
      return amqpChannel.assertQueue('', { durable: true }).then(function (q) {
        amqpChannel.bindQueue(q.queue, RMQ_WORK_EXCHANGE_NAME, RMQ_WORK_IN_ROUTING_KEY)
        return amqpChannel.consume(q.queue, function (msg) {
          if (msg !== null) {
            // determine the source of the message and handle appropriately
            switch (msg.fields.routingKey) {
              case RMQ_WORK_IN_SPLITTER_ROUTING_KEY:
                processSplitterWork(msg)
                break
              case RMQ_WORK_IN_AGG_0_ROUTING_KEY:
                processAggregatorWork(msg)
                break
              case RMQ_WORK_IN_CAL_ROUTING_KEY:
                processCalWork(msg)
                break
              case RMQ_WORK_IN_ETH_ROUTING_KEY:
                processEthWork(msg)
                break
              case RMQ_WORK_IN_BTC_ROUTING_KEY:
                processBtcWork(msg)
                break
              default:
                // This is an unknown state type, unknown routing key
                console.error('Unknown state type or routing key', msg.fields.routingKey)
            }
          }
        })
      })
    })
  }).catch(() => {
    // catch errors when attempting to establish connection
    console.error('Cannot establish connection. Attempting in 5 seconds...')
    setTimeout(amqpOpenConnection.bind(null, connectionString), 5 * 1000)
  })
}

// Start reading from queue and splitting hashes
amqpOpenConnection(RABBITMQ_CONNECT_URI)
