const amqp = require('amqplib')
const async = require('async')

const storageClient = require('./storage-adapters/redis.js')

require('dotenv').config()

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
* Writes the state data to persitent storage and pulbishes a message
* for consumption by the next service(s)
*
* @param {amqp message object} msg - The AMQP message received from the queue
* @param {string} stateType - The state type identifier
* @param {array} outRoutingKeys - The routing key(s) to which messages are published
*/
function doStorageAndMessageWork (msg, stateType, outRoutingKeys) {
  let messageObj = JSON.parse(msg.content.toString())
  let stateObj = {}
  stateObj.hash_id = messageObj.hash_id
  stateObj.type = stateType
  stateObj.state = messageObj.state
  console.log(stateObj)

  // Store this state information
  storageClient.writeStateObject(stateObj, function (err, success) {
    if (err) {
      console.error('error writing state object', err)
      amqpChannel.nack(msg)
      console.error(msg.fields.routingKey, 'consume message nacked')
    } else {
      let dataOutObj = {}
      dataOutObj.hash_id = messageObj.hash_id
      dataOutObj.hash = messageObj.value

      // Publish an object for consumption by the next service(s) for each provided routing key
      async.each(outRoutingKeys, function (routingKey, callback) {
        amqpChannel.publish(RMQ_WORK_EXCHANGE_NAME, routingKey, new Buffer(JSON.stringify(dataOutObj)), { persistent: true },
          function (err, ok) {
            if (err) {
              console.error(routingKey, 'publish message nacked')
              return callback(err)
            } else {
              console.log(routingKey, 'publish message acked')
              return callback(null)
            }
          })
      }, function (err) {
        if (err) {
          // An error as occurred publishing a message, nack consumption of original message
          amqpChannel.nack(msg)
          console.error(msg.fields.routingKey, 'consume message nacked')
        } else {
          // New message has been published, ack consumption of original message
          amqpChannel.ack(msg)
          console.log(msg.fields.routingKey, 'consume message acked')
        }
      })
    }
  })
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
      case RMQ_WORK_IN_SPLITTER_ROUTING_KEY:
        // Consumes a message from the Splitter service
        // Stores state information and publishes message bound for aggregation service
        doStorageAndMessageWork(msg, 'splitter', [RMQ_WORK_OUT_AGGREGATOR_0_ROUTING_KEY])
        break
      case RMQ_WORK_IN_AGG_0_ROUTING_KEY:
        // Consumes a message from the Aggregator service
        // Stores state information and publishes message bound for Calendar service
        doStorageAndMessageWork(msg, 'agg_0', [RMQ_WORK_OUT_CAL_ROUTING_KEY])
        break
      case RMQ_WORK_IN_CAL_ROUTING_KEY:
        // Consumes a message from the Calendar service
        // Stores state information and publishes message bound for Generator, Eth Anchor and Btc service
        doStorageAndMessageWork(msg, 'cal', [RMQ_WORK_OUT_CAL_GEN_ROUTING_KEY, RMQ_WORK_OUT_ETH_ROUTING_KEY, RMQ_WORK_OUT_BTC_ROUTING_KEY])
        break
      case RMQ_WORK_IN_ETH_ROUTING_KEY:
        // Consumes a message from the Eth Anchor service
        // Stores state information and publishes message bound for Generator
        doStorageAndMessageWork(msg, 'eth', [RMQ_WORK_OUT_ETH_GEN_ROUTING_KEY])
        break
      case RMQ_WORK_IN_BTC_ROUTING_KEY:
        // Consumes a message from the Calendar service
        // Stores state information and publishes message bound for Generator
        doStorageAndMessageWork(msg, 'btc', [RMQ_WORK_OUT_BTC_GEN_ROUTING_KEY])
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

/**
 * Opens a storage connection
 *
 * @param {object} options - object containing 'port' and 'uri' parameters
 */
function openStorageConnection (callback) {
  storageClient.openConnection(function (err, success) {
    if (err) {
      // catch errors when attempting to establish connection
      console.error('Cannot establish storage connection. Attempting in 5 seconds...')
      setTimeout(openStorageConnection.bind(null, callback), 5 * 1000)
    } else {
      return callback(null, true)
    }
  })
}

// Open storage connection and then amqp connection
openStorageConnection(function (err, result) {
  if (err) {
    console.error(err)
  } else {
    amqpOpenConnection(RABBITMQ_CONNECT_URI)
  }
})
