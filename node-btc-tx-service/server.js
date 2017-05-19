const amqp = require('amqplib/callback_api')
const async = require('async')
const _ = require('lodash')
const bcoin = require('bcoin')
require('dotenv').config()

const CONSUL_HOST = process.env.CONSUL_HOST || 'consul'
const CONSUL_PORT = process.env.CONSUL_PORT || 8500
const consul = require('consul')({host: CONSUL_HOST, port: CONSUL_PORT})

// THE maximum number of messages sent over the channel that can be awaiting acknowledgement, 0 = no limit
const RMQ_PREFETCH_COUNT = process.env.RMQ_PREFETCH_COUNT || 0

// The queue name for message consumption originating from the proof state service
const RMQ_WORK_IN_QUEUE = process.env.RMQ_WORK_IN_QUEUE || 'work.btctx'

// Connection string w/ credentials for RabbitMQ
const RABBITMQ_CONNECT_URI = process.env.RABBITMQ_CONNECT_URI || 'amqp://chainpoint:chainpoint@rabbitmq'

// The channel used for all amqp communication
// This value is set once the connection has been established
let amqpChannel = null

// The consul key to watch to receive updated fee object
const BTC_REC_FEE_KEY = process.env.BTC_REC_FEE_KEY || 'service/btc-fee/recommendation'

// locally store the fee object here when updated
var BTCRecommendedFee = null

let sendTxToBTC = () => {
  console.log('BTC TX...')
}

/**
* Parses a message and performs the required work for that message
*
* @param {amqp message object} msg - The AMQP message received from the queue
*/
function processIncomingAnchorJob (msg) {
  if (msg !== null) {
    let messageObj = JSON.parse(msg.content.toString())
    // TODO: messageObj will contain, at minimum, the value to be anchored, likely a merkle root hex string, messageObj.data
    // TODO: create the transaction using the value to be anchored
    // TODO: publish the transaction
    // TODO: if the publish was successful, then
    amqpChannel.ack(msg)
    // TODO: and record/queue the transaction/publish results somewhere
    // otherwise, amqpChannel.nack(msg)
  }
}

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
        chan.prefetch(RMQ_PREFETCH_COUNT)
        amqpChannel = chan
        // Receive and process messages meant to initiate btc tx generation and publishing
        chan.consume(RMQ_WORK_IN_QUEUE, (msg) => {
          processIncomingAnchorJob(msg)
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

// Open amqp connection
amqpOpenConnection(RABBITMQ_CONNECT_URI)

setInterval(() => sendTxToBTC(), 1000 * 60 * 10) // 10 min

// Continuous watch on the consul key holding the fee object.
var watch = consul.watch({method: consul.kv.get, options: { key: BTC_REC_FEE_KEY }})

// Store the updated fee object on change
watch.on('change', function (data, res) {
  // console.log('data:', data)
  BTCRecommendedFee = JSON.parse(data.Value)
  console.log(BTCRecommendedFee)
})

// Oops, something is wrong with consul
// or the fee service key
watch.on('error', function (err) {
  console.error('error:', err)
})
