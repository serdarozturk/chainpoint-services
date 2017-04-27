const amqp = require('amqplib/callback_api')
const async = require('async')

require('dotenv').config()

// THE maximum number of messages sent over the channel that can be awaiting acknowledgement, 0 = no limit
const RMQ_PREFETCH_COUNT = process.env.RMQ_PREFETCH_COUNT || 0

// The queue name for message consumption originating from the api service
const RMQ_WORK_IN_QUEUE = process.env.RMQ_WORK_IN_QUEUE || 'work.splitter'

// The queue name for outgoing message to the aggregator service
const RMQ_WORK_OUT_AGG_QUEUE = process.env.RMQ_WORK_OUT_AGG_QUEUE || 'work.agg'

// The queue name for outgoing message to the proof state service
const RMQ_WORK_OUT_STATE_QUEUE = process.env.RMQ_WORK_OUT_STATE_QUEUE || 'work.state'

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
        chan.assertQueue(RMQ_WORK_OUT_AGG_QUEUE, { durable: true })
        chan.assertQueue(RMQ_WORK_OUT_STATE_QUEUE, { durable: true })
        chan.prefetch(RMQ_PREFETCH_COUNT)
        amqpChannel = chan
        // Continuously load the HASHES from RMQ with hash objects to process)
        chan.consume(RMQ_WORK_IN_QUEUE, (msg) => {
          consumeHashMessage(msg)
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

function consumeHashMessage (msg) {
  // if the amqp channel is null (closed), processing should not continue, defer to next consumeHashMessage call
  if (amqpChannel === null) return

  if (msg !== null) {
    let incomingHashBatch = JSON.parse(msg.content.toString()).hashes

    async.each(incomingHashBatch, (hashObj, callback) => {
      async.series([
        (seriesCallback) => {
          // Send this hash object message to the aggregator service
          amqpChannel.sendToQueue(RMQ_WORK_OUT_AGG_QUEUE, Buffer.from(JSON.stringify(hashObj)), { persistent: true },
            (err, ok) => {
              if (err !== null) {
                console.error(RMQ_WORK_OUT_AGG_QUEUE, 'publish message nacked')
                return seriesCallback(err)
              } else {
                console.log(RMQ_WORK_OUT_AGG_QUEUE, 'publish message acked')
                return seriesCallback(null)
              }
            })
        },
        // Send this hash object message to the proof state service for the tracking log
        (seriesCallback) => {
          amqpChannel.sendToQueue(RMQ_WORK_OUT_STATE_QUEUE, Buffer.from(JSON.stringify(hashObj)), { persistent: true, type: 'splitter' },
            (err, ok) => {
              if (err !== null) {
                console.error(RMQ_WORK_OUT_STATE_QUEUE, '[splitter] publish message nacked')
                return callback(err)
              } else {
                console.log(RMQ_WORK_OUT_STATE_QUEUE, '[splitter] publish message acked')
                return callback(null)
              }
            })
        }
      ], (err) => {
        if (err) return callback(err)
        return callback(null)
      })
    }, (err) => {
      if (err) {
        // An error has occurred publishing a message, nack consumption of message
        amqpChannel.nack(msg)
        console.error(RMQ_WORK_IN_QUEUE, 'consume message nacked')
      } else {
        amqpChannel.ack(msg)
        console.log(RMQ_WORK_IN_QUEUE, 'consume message acked')
      }
    })
  }
}

// Start reading from queue and splitting hashes
amqpOpenConnection(RABBITMQ_CONNECT_URI)

// export these functions for testing purposes
module.exports = {
  getAMQPChannel: function () { return amqpChannel },
  setAMQPChannel: (chan) => { amqpChannel = chan },
  amqpOpenConnection: amqpOpenConnection,
  consumeHashMessage: consumeHashMessage
}
