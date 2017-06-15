const amqp = require('amqplib/callback_api')
const async = require('async')

// load all environment variables into env object
const env = require('./lib/parse-env.js')('splitter')

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
        console.log('RabbitMQ connection established')
        chan.assertQueue(env.RMQ_WORK_IN_SPLITTER_QUEUE, { durable: true })
        chan.assertQueue(env.RMQ_WORK_OUT_AGG_QUEUE, { durable: true })
        chan.assertQueue(env.RMQ_WORK_OUT_STATE_QUEUE, { durable: true })
        chan.prefetch(env.RMQ_PREFETCH_COUNT_SPLITTER)
        amqpChannel = chan
        // Continuously load the HASHES from RMQ with hash objects to process)
        chan.consume(env.RMQ_WORK_IN_SPLITTER_QUEUE, (msg) => {
          consumeHashMessage(msg)
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

function consumeHashMessage (msg) {
  // if the amqp channel is null (closed), processing should not continue, defer to next consumeHashMessage call
  if (amqpChannel === null) return

  if (msg !== null) {
    let incomingHashBatch = JSON.parse(msg.content.toString()).hashes

    async.each(incomingHashBatch, (hashObj, callback) => {
      async.series([
        (seriesCallback) => {
          // Send this hash object message to the aggregator service
          amqpChannel.sendToQueue(env.RMQ_WORK_OUT_AGG_QUEUE, Buffer.from(JSON.stringify(hashObj)), { persistent: true },
            (err, ok) => {
              if (err !== null) {
                console.error(env.RMQ_WORK_OUT_AGG_QUEUE, 'publish message nacked')
                return seriesCallback(err)
              } else {
                console.log(env.RMQ_WORK_OUT_AGG_QUEUE, 'publish message acked')
                return seriesCallback(null)
              }
            })
        },
        // Send this hash object message to the proof state service for the tracking log
        (seriesCallback) => {
          amqpChannel.sendToQueue(env.RMQ_WORK_OUT_STATE_QUEUE, Buffer.from(JSON.stringify(hashObj)), { persistent: true, type: 'splitter' },
            (err, ok) => {
              if (err !== null) {
                console.error(env.RMQ_WORK_OUT_STATE_QUEUE, '[splitter] publish message nacked')
                return callback(err)
              } else {
                console.log(env.RMQ_WORK_OUT_STATE_QUEUE, '[splitter] publish message acked')
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
        console.error(env.RMQ_WORK_IN_SPLITTER_QUEUE, 'consume message nacked')
      } else {
        amqpChannel.ack(msg)
        console.log(env.RMQ_WORK_IN_SPLITTER_QUEUE, 'consume message acked')
      }
    })
  }
}

// Start reading from queue and splitting hashes
amqpOpenConnection(env.RABBITMQ_CONNECT_URI)

// export these functions for testing purposes
module.exports = {
  getAMQPChannel: function () { return amqpChannel },
  setAMQPChannel: (chan) => { amqpChannel = chan },
  amqpOpenConnection: amqpOpenConnection,
  consumeHashMessage: consumeHashMessage
}
