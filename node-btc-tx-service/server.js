const amqp = require('amqplib/callback_api')
const async = require('async')
const bcoin = require('bcoin')
const request = require('request')
require('dotenv').config()

const REDIS_CONNECT_URI = process.env.REDIS_CONNECT_URI || 'redis://redis:6379'
const r = require('redis')
const redis = r.createClient(REDIS_CONNECT_URI)

// THE maximum number of messages sent over the channel that can be awaiting acknowledgement, 0 = no limit
const RMQ_PREFETCH_COUNT = process.env.RMQ_PREFETCH_COUNT || 0

// The queue name for message consumption originating from the proof state service
const RMQ_WORK_IN_QUEUE = process.env.RMQ_WORK_IN_QUEUE || 'work.btctx'

// Connection string w/ credentials for RabbitMQ
const RABBITMQ_CONNECT_URI = process.env.RABBITMQ_CONNECT_URI || 'amqp://chainpoint:chainpoint@rabbitmq'

// The channel used for all amqp communication
// This value is set once the connection has been established
let amqpChannel = null

// The published key location where recommended fee is stored
// for use by other services.
const BTC_REC_FEE_KEY = process.env.BTC_REC_FEE_KEY || 'btc_rec_fee'

// The interval, in seconds, that the local BTCRecommendedFee variable is refreshed from BTC_REC_FEE_KEY
const BTC_REC_FEE_REFRESH_INTERVAL = process.env.BTC_REC_FEE_REFRESH_INTERVAL || 60

// BCOIN REST API
// These values are private and are accessed from environment variables only
const BCOIN_API_BASE_URI = process.env.BCOIN_API_URI
const BCOIN_API_WALLET_ID = process.env.BCOIN_API_WALLET_ID
const BCOIN_API_WALLET_TOKEN = process.env.BCOIN_API_WALLET_TOKEN
const BCOIN_API_USERNAME = process.env.BCOIN_API_BASIC_AUTH_USERNAME
const BCOIN_API_PASS = process.env.BCOIN_API_BASIC_AUTH_PASS

// The local variable holding the Bitcoin recommended fee value, from Redis in BTC_REC_FEE_KEY,
// refreshed at the interval specified in BTC_REC_FEE_REFRESH_INTERVAL
// Sample BTCRecommendedFee Object ->
// {"recFeeInSatPerByte":240,"recFeeInSatForAvgTx":56400,"recFeeInBtcForAvgTx":0.000564,"recFeeInUsdForAvgTx":0.86,"avgTxSizeBytes":235}
let recFee = null

// FIXME : Add etcd server, node client, and leader election and abort the periodic run of this service if not the leader.
// FIXME : Add bcoin server and send raw tx to bcoin server directly w/ https://bitcoinjs.org/ ?
// FIXME : Wallet? https://github.com/bitcoinjs/bip32-utils
// FIXME : Wut? Is this stealth code? https://github.com/bitcoinjs/bitcoinjs-lib/blob/master/test/integration/stealth.js

/**
* Convert string into compiled bcoin TX value for a null data OP_RETURN
*
* @param {string} hash - The hash to embed in an OP_RETURN
*/
const genTxScript = (hash) => {
  const opcodes = bcoin.script.opcodes
  const script = new bcoin.script()
  script.push(opcodes.OP_RETURN)
  script.push(hash)
  script.compile()

  return script.toJSON()
}

/**
* Generate a POST body suitable for submission to bcoin REST API
*
* @param {string} fee - The miners fee for this TX in Satoshi's per byte
* @param {string} hash - The hash to embed in an OP_RETURN
*/
const genTxBody = (fee, hash) => {
  let body = {
    token: BCOIN_API_WALLET_TOKEN,
    rate: fee,
    outputs: [{
      script: genTxScript(hash)
    }]
  }

  console.log(body)
  return body
}

/**
* Send a POST request to /wallet/:id/send with a POST body
* containing an OP_RETURN TX
*
* @param {string} hash - The hash to embed in an OP_RETURN
*/
const sendTxToBTC = (hash) => {
  let body = genTxBody(recFee.recFeeInSatPerByte, hash)
  console.log(body)

  let options = {
    method: 'POST',
    uri: BCOIN_API_BASE_URI + '/wallet/' + BCOIN_API_WALLET_ID + '/send',
    body: JSON.stringify(body),
    json: true,
    gzip: true,
    auth: {
      user: BCOIN_API_USERNAME,
      pass: BCOIN_API_PASS
    }
  }

  console.log('sending')
  request(options, function (err, response, body) {
    if (!err && response.statusCode === 200) {
      // FIXME : data about the successful TX needs to be sent to the monitoring service
      // so it can watch for 6 confirmations
      console.log('success tx')
      console.log(body)
    } else {
      // FIXME : what do we do if the POST fails?
      // fallback to a secondary server?
      // make an API call to a 3rd party?
      console.log('fail tx')
      console.log(err)
    }
  })
}

const refreshRecFee = (callback) => {
  redis.get(BTC_REC_FEE_KEY, (err, res) => {
    if (err) return callback(err)
    return callback(null, res)
  })
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

// setInterval(() => sendTxToBTC(), 1000 * 60 * 10) // 10 min
// let hash = '407ba568d471e708b6a4b312cfe57e9a525bea684d075c0fb0ce23feb32f57b6'
// setInterval(() => sendTxToBTC(hash), 15000)

/**
 * Initializes RecFee
 **/
function initializeRecFee (callback) {
  // refresh on script startup, and periodically afterwards
  refreshRecFee((err, result) => {
    if (err) {
      setTimeout(initializeRecFee.bind(null, callback), 5 * 1000)
      return callback('Cannot initialize RecFee. Attempting in 5 seconds...')
    } else {
      // RecFee initialized, now refresh every BTC_REC_FEE_REFRESH_INTERVAL seconds
      setInterval(() => initializeRecFee.bind(null, callback), 1000 * BTC_REC_FEE_REFRESH_INTERVAL)
      return callback(null, true)
    }
  })
}

// Initializes RecFee and then amqp connection
initializeRecFee((err, result) => {
  if (err) {
    console.error(err)
  } else {
    amqpOpenConnection(RABBITMQ_CONNECT_URI)
  }
})
