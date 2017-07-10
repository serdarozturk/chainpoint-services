// load all environment variables into env object
const env = require('./lib/parse-env.js')('splitter')

const amqp = require('amqplib')
const async = require('async')
const utils = require('./lib/utils.js')

// The channel used for all amqp communication
// This value is set once the connection has been established
var amqpChannel = null

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

/**
 * Opens an AMPQ connection and channel
 * Retry logic is included to handle losses of connection
 *
 * @param {string} connectionString - The connection string for the RabbitMQ instance, an AMQP URI
 */
async function openRMQConnectionAsync (connectionString) {
  let rmqConnected = false
  while (!rmqConnected) {
    try {
      // connect to rabbitmq server
      let conn = await amqp.connect(connectionString)
      // create communication channel
      let chan = await conn.createConfirmChannel()
      // the connection and channel have been established
      chan.assertQueue(env.RMQ_WORK_IN_SPLITTER_QUEUE, { durable: true })
      chan.assertQueue(env.RMQ_WORK_OUT_AGG_QUEUE, { durable: true })
      chan.assertQueue(env.RMQ_WORK_OUT_STATE_QUEUE, { durable: true })
      chan.prefetch(env.RMQ_PREFETCH_COUNT_SPLITTER)
      amqpChannel = chan
      // Continuously load the HASHES from RMQ with hash objects to process)
      chan.consume(env.RMQ_WORK_IN_SPLITTER_QUEUE, (msg) => {
        consumeHashMessage(msg)
      })
      // if the channel closes for any reason, attempt to reconnect
      conn.on('close', async () => {
        console.error('Connection to RMQ closed.  Reconnecting in 5 seconds...')
        amqpChannel = null
        await utils.sleep(5000)
        await openRMQConnectionAsync(connectionString)
      })
      console.log('RabbitMQ connection established')
      rmqConnected = true
    } catch (error) {
      // catch errors when attempting to establish connection
      console.error('Cannot establish RabbitMQ connection. Attempting in 5 seconds...')
      await utils.sleep(5000)
    }
  }
}

// process all steps need to start the application
async function start () {
  if (env.NODE_ENV === 'test') return
  try {
    // init RabbitMQ
    await openRMQConnectionAsync(env.RABBITMQ_CONNECT_URI)
    console.log('startup completed successfully')
  } catch (err) {
    console.error(`An error has occurred on startup: ${err}`)
    process.exit(1)
  }
}

// get the whole show started
start()

// export these functions for testing purposes
module.exports = {
  getAMQPChannel: function () { return amqpChannel },
  setAMQPChannel: (chan) => { amqpChannel = chan },
  openRMQConnectionAsync: openRMQConnectionAsync,
  consumeHashMessage: consumeHashMessage
}
