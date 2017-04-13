const amqp = require('amqplib')
const async = require('async')

require('dotenv').config()

// The RabbitMQ exchange name
const RMQ_WORK_EXCHANGE_NAME = process.env.RMQ_WORK_EXCHANGE_NAME || 'work_topic_exchange'

// The RabbitMQ topic key for incoming message from the web service
const RMQ_WORK_IN_ROUTING_KEY = process.env.RMQ_WORK_IN_ROUTING_KEY || 'work.splitter'

// The RabbitMQ topic key for outgoing message to the proof state service
const RMQ_WORK_OUT_ROUTING_KEY = process.env.RMQ_WORK_OUT_ROUTING_KEY || 'work.splitter.state'

// Connection string w/ credentials for RabbitMQ
const RABBITMQ_CONNECT_URI = process.env.RABBITMQ_CONNECT_URI || 'amqp://chainpoint:chainpoint@rabbitmq'

// The channel used for all amqp communication
// This value is set once the connection has been established
// API methods should return 502 when this value is null
var amqpChannel = null
// getter and setter methods added for testing purposes
function getAMQPChannel () { return amqpChannel }
function setAMQPChannel (chan) { amqpChannel = chan }

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
      setAMQPChannel(null)
      setTimeout(amqpOpenConnection.bind(null, connectionString), 5 * 1000)
    })
    conn.createConfirmChannel().then(function (chan) {
      // the connection and channel have been established
      console.log('Connection established')
      setAMQPChannel(chan)
      chan.assertExchange(RMQ_WORK_EXCHANGE_NAME, 'topic', { durable: true })

      // Continuously load the HASHES from RMQ with hash objects to process
      return chan.assertQueue('', { durable: true }).then(function (q) {
        chan.bindQueue(q.queue, RMQ_WORK_EXCHANGE_NAME, RMQ_WORK_IN_ROUTING_KEY)
        return chan.consume(q.queue, function (msg) {
          consumeHashMessage(msg)
        })
      })
    })
  }).catch(() => {
    // catch errors when attempting to establish connection
    console.error('Cannot establish connection. Attempting in 5 seconds...')
    setTimeout(amqpOpenConnection.bind(null, connectionString), 5 * 1000)
  })
}

function consumeHashMessage (msg) {
  let chan = getAMQPChannel()
  if (msg !== null) {
    let incomingHashBatch = JSON.parse(msg.content.toString()).hashes

    async.each(incomingHashBatch, function (hashObj, callback) {
      console.log(hashObj)
      let stateObj = {}
      stateObj.hash_id = hashObj.hash_id
      stateObj.state = {}
      stateObj.state.hash = hashObj.hash
      chan.publish(RMQ_WORK_EXCHANGE_NAME, RMQ_WORK_OUT_ROUTING_KEY, new Buffer(JSON.stringify(stateObj)), { persistent: true },
        function (err, ok) {
          if (err !== null) {
            console.error(RMQ_WORK_OUT_ROUTING_KEY, 'publish message nacked')
            return callback(err)
          } else {
            console.log(RMQ_WORK_OUT_ROUTING_KEY, 'publish message acked')
            return callback(null)
          }
        })
    }, function (err) {
      if (err) {
        // An error as occurred publishing a message, nack consumption of message
        chan.nack(msg)
        console.error(RMQ_WORK_IN_ROUTING_KEY, 'consume message nacked')
      } else {
        chan.ack(msg)
        console.log(RMQ_WORK_IN_ROUTING_KEY, 'consume message acked')
      }
    })
  }
}

// Start reading from queue and splitting hashes
amqpOpenConnection(RABBITMQ_CONNECT_URI)

// export these functions for testing purposes
module.exports = {
  amqpOpenConnection: amqpOpenConnection,
  consumeHashMessage: consumeHashMessage,
  getAMQPChannel: getAMQPChannel,
  setAMQPChannel: setAMQPChannel
}
