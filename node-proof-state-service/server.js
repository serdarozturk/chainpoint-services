const amqp = require('amqplib')
const async = require('async')

const storageClient = require('./storage-adapters/crate.js')

require('dotenv').config()

// the name of the RabbitMQ topic exchange to use
const RMQ_WORK_EXCHANGE_NAME = process.env.RMQ_WORK_EXCHANGE_NAME || 'work_topic_exchange'

// the topic exchange routing key for message consumption originating from all other services
const RMQ_WORK_IN_ROUTING_KEY = process.env.RMQ_WORK_IN_ROUTING_KEY || 'work.*.state'

// the topic exchange routing key for message consumption originating from aggregator service
const RMQ_WORK_IN_AGG_ROUTING_KEY = process.env.RMQ_WORK_IN_AGG_ROUTING_KEY || 'work.agg.state'

// the topic exchange routing key for message consumption originating from calendar service
const RMQ_WORK_IN_CAL_ROUTING_KEY = process.env.RMQ_WORK_IN_CAL_ROUTING_KEY || 'work.cal.state'

// the topic exchange routing key for message publishing bound for the proof generation service for calendar generation
const RMQ_WORK_OUT_CAL_GEN_ROUTING_KEY = process.env.RMQ_WORK_OUT_CAL_GEN_ROUTING_KEY || 'work.generator.cal'

// the topic exchange routing key for message publishing bound for the proof generation service for eth anchor generation
const RMQ_WORK_OUT_ETH_GEN_ROUTING_KEY = process.env.RMQ_WORK_OUT_ETH_GEN_ROUTING_KEY || 'work.generator.eth'

// the topic exchange routing key for message publishing bound for the proof generation service for btc anchor generation
const RMQ_WORK_OUT_BTC_GEN_ROUTING_KEY = process.env.RMQ_WORK_OUT_BTC_GEN_ROUTING_KEY || 'work.generator.btc'

// Connection string w/ credentials for RabbitMQ
const RABBITMQ_CONNECT_URI = process.env.RABBITMQ_CONNECT_URI || 'amqp://chainpoint:chainpoint@rabbitmq'
// The channel used for all amqp communication
// This value is set once the connection has been established
var amqpChannel = null

/**
* Writes the state data to persistent storage
*
* @param {amqp message object} msg - The AMQP message received from the queue
*/
function ConsumeAggregationMessage (msg) {
  let messageObj = JSON.parse(msg.content.toString())
  let stateObj = {}
  stateObj.type = 'agg'
  stateObj.hash_id = messageObj.hash_id
  stateObj.hash = messageObj.hash
  stateObj.agg_id = messageObj.agg_id
  stateObj.agg_root = messageObj.agg_root
  stateObj.agg_state = messageObj.agg_state
  console.log(stateObj)

  // Store this state information
  storageClient.writeAggStateObject(stateObj, function (err, success) {
    if (err) {
      console.error('error writing state object', err)
      amqpChannel.nack(msg)
      console.error(msg.fields.routingKey, 'consume message nacked')
    } else {
      // New message has been published, ack consumption of original message
      amqpChannel.ack(msg)
      console.log(msg.fields.routingKey, 'consume message acked')
    }
  })
}

/**
* Writes the state data to persistent storage and queues a calendar proof generation message
*
* @param {amqp message object} msg - The AMQP message received from the queue
*/
function ConsumeCalendarMessage (msg) {
  let messageObj = JSON.parse(msg.content.toString())
  let stateObj = {}
  stateObj.type = 'cal'
  stateObj.agg_id = messageObj.agg_id
  stateObj.agg_root = messageObj.agg_root
  stateObj.cal_id = messageObj.cal_id
  stateObj.cal_root = messageObj.cal_root
  stateObj.cal_state = messageObj.cal_state
  console.log(stateObj)

  // Store this state information
  storageClient.writeCalStateObject(stateObj, function (err, success) {
    if (err) {
      console.error('error writing state object', err)
      amqpChannel.nack(msg)
      console.error(msg.fields.routingKey, 'consume message nacked')
    } else {
      let dataOutObj = {}
      dataOutObj.agg_id = messageObj.agg_id

      // Publish an object for consumption by the proof generation service
      amqpChannel.publish(RMQ_WORK_EXCHANGE_NAME, RMQ_WORK_OUT_CAL_GEN_ROUTING_KEY, new Buffer(JSON.stringify(dataOutObj)), { persistent: true },
        function (err, ok) {
          if (err) {
            console.error(RMQ_WORK_OUT_CAL_GEN_ROUTING_KEY, 'publish message nacked')
            // An error as occurred publishing a message, nack consumption of original message
            amqpChannel.nack(msg)
            console.error(msg.fields.routingKey, 'consume message nacked')
          } else {
            console.log(RMQ_WORK_OUT_CAL_GEN_ROUTING_KEY, 'publish message acked')
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
      case RMQ_WORK_IN_AGG_ROUTING_KEY:
        // Consumes a state message from the Aggregator service
        // Stores state information
        ConsumeAggregationMessage(msg)
        break
      case RMQ_WORK_IN_CAL_ROUTING_KEY:
        // Consumes a state message from the Calendar service
        // Stores state information and publishes message bound for the proof generator service
        ConsumeCalendarMessage(msg)
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
 **/
function openStorageConnection (callback) {
  storageClient.openConnection(function (err, success) {
    if (err) {
      // catch errors when attempting to establish connection
      if (err === 'not_ready') {
        // the storage service is not ready to accept connections, schedule retry
        console.error('Cannot establish storage connection. Attempting in 5 seconds...')
        setTimeout(openStorageConnection.bind(null, callback), 5 * 1000)
      } else {
        // a fatal error has occured, exit
        return callback('fatal error opening storage connection')
      }
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
