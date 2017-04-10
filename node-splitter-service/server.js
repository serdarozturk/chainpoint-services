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
      console.log('Connection established')
      chan.assertExchange(RMQ_WORK_EXCHANGE_NAME, 'topic', { durable: true })
      amqpChannel = chan

      // Continuously load the HASHES from RMQ with hash objects to process
      return amqpChannel.assertQueue('', { durable: true }).then(function (q) {
        amqpChannel.bindQueue(q.queue, RMQ_WORK_EXCHANGE_NAME, RMQ_WORK_IN_ROUTING_KEY)
        return amqpChannel.consume(q.queue, function (msg) {
          if (msg !== null) {
            let incomingHashBatch = JSON.parse(msg.content.toString()).hashes

            async.each(incomingHashBatch, function (hashObj, callback) {
              console.log(hashObj)
              amqpChannel.publish(RMQ_WORK_EXCHANGE_NAME, RMQ_WORK_OUT_ROUTING_KEY, new Buffer(JSON.stringify(hashObj)), { persistent: true },
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
                // An error as occurred publishing a message, nack consumption of entire batch
                console.err(RMQ_WORK_IN_ROUTING_KEY, 'consume message nacked')
              } else {
                console.log(RMQ_WORK_IN_ROUTING_KEY, 'consume message acked')
              }
            })
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
