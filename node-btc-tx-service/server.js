const amqp = require('amqplib/callback_api')
const async = require('async')
const bcoin = require('bcoin')
const request = require('request')
require('dotenv').config()

const CONSUL_HOST = process.env.CONSUL_HOST || 'consul'
const CONSUL_PORT = process.env.CONSUL_PORT || 8500
const consul = require('consul')({ host: CONSUL_HOST, port: CONSUL_PORT })

// THE maximum number of messages sent over the channel that can be awaiting acknowledgement, 0 = no limit
const RMQ_PREFETCH_COUNT = process.env.RMQ_PREFETCH_COUNT || 0

// The queue name for message consumption originating from the calendar service
const RMQ_WORK_IN_QUEUE = process.env.RMQ_WORK_IN_QUEUE || 'work.btctx'

// The queue name for outgoing message to the calendar service
const RMQ_WORK_OUT_CAL_QUEUE = process.env.RMQ_WORK_OUT_CAL_QUEUE || 'work.cal'

// Connection string w/ credentials for RabbitMQ
const RABBITMQ_CONNECT_URI = process.env.RABBITMQ_CONNECT_URI || 'amqp://chainpoint:chainpoint@rabbitmq'

// The channel used for all amqp communication
// This value is set once the connection has been established
let amqpChannel = null

// The consul key to watch to receive updated fee object
const BTC_REC_FEE_KEY = process.env.BTC_REC_FEE_KEY || 'service/btc-fee/recommendation'

// The mamimum recFeeInSatPerByte value accepted.
// This is to safeguard against the service returning a very high value in error
// and to impose a common sense limit on the highest fee per byte to allow.
// MAX BTC to spend = AverageTxSizeBytes * BTC_MAX_FEE_SAT_PER_BYTE / 100000000
// If we are to limit the maximum fee per transaction to 0.01 BTC, then
// 0.01 = 235 * BTC_MAX_FEE_SAT_PER_BYTE / 100000000
// BTC_MAX_FEE_SAT_PER_BYTE = 0.01 *  100000000 / 235
// BTC_MAX_FEE_SAT_PER_BYTE = 4255
const BTC_MAX_FEE_SAT_PER_BYTE = process.env.BTC_MAX_FEE_SAT_PER_BYTE || 4255

// BCOIN REST API
// These values are private and are accessed from environment variables only
const BCOIN_API_BASE_URI = process.env.BCOIN_API_BASE_URI
const BCOIN_API_WALLET_ID = process.env.BCOIN_API_WALLET_ID
const BCOIN_API_WALLET_TOKEN = process.env.BCOIN_API_WALLET_TOKEN
const BCOIN_API_USERNAME = process.env.BCOIN_API_USERNAME
const BCOIN_API_PASS = process.env.BCOIN_API_PASS

// The local variable holding the Bitcoin recommended fee value, from Consul at key BTC_REC_FEE_KEY,
// pushed from consul and refreshed automatically when any update in value is made
// Sample BTCRecommendedFee Object ->
// {"recFeeInSatPerByte":240,"recFeeInSatForAvgTx":56400,"recFeeInBtcForAvgTx":0.000564,"recFeeInUsdForAvgTx":0.86,"avgTxSizeBytes":235}
var BTCRecommendedFee = null

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
  // of the fee exceeds the maximum, revert to BTC_MAX_FEE_SAT_PER_BYTE for the fee
  if (fee > BTC_MAX_FEE_SAT_PER_BYTE) {
    console.error(`Fee of ${fee} per byte exceeded BTC_MAX_FEE_SAT_PER_BYTE of ${BTC_MAX_FEE_SAT_PER_BYTE}`)
    fee = BTC_MAX_FEE_SAT_PER_BYTE
  }
  let body = {
    token: BCOIN_API_WALLET_TOKEN,
    rate: fee,
    outputs: [{
      script: genTxScript(hash)
    }]
  }
  return body
}

/**
* Send a POST request to /wallet/:id/send with a POST body
* containing an OP_RETURN TX
*
* @param {string} hash - The hash to embed in an OP_RETURN
*/
const sendTxToBTC = (hash, callback) => {
  let body = genTxBody(BTCRecommendedFee.recFeeInSatPerByte, hash)

  let options = {
    headers: [
      {
        name: 'Content-Type',
        value: 'application/json'
      }
    ],
    method: 'POST',
    uri: BCOIN_API_BASE_URI + '/wallet/' + BCOIN_API_WALLET_ID + '/send',
    body: body,
    json: true,
    gzip: true,
    auth: {
      user: BCOIN_API_USERNAME,
      pass: BCOIN_API_PASS
    }
  }
  request(options, function (err, response, body) {
    if (err || response.statusCode !== 200) {
      // TODO: Implement alternative if POST fails
      if (!err) err = `POST failed with status code ${response.statusCode}`
      return callback(err)
    }
    // FIXME : data about the successful TX needs to be sent to the monitoring service
    // so it can watch for 6 confirmations
    return callback(null, body)
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
    // the value to be anchored, likely a merkle root hex string
    let anchorData = messageObj.anchor_agg_root
    async.waterfall([
      (callback) => {
        // create and publish the transaction
        sendTxToBTC(anchorData, (err, body) => {
          if (err) return callback(err)
          return callback(null, body)
        })
      },
      (body, callback) => {
        // queue return message for calendar containing the new transaction information
        console.log(body)
        // adding btc transaction id and full transaction body to original message and returning
        messageObj.btctx_id = body.hash
        messageObj.btctx_body = body.tx
        amqpChannel.sendToQueue(RMQ_WORK_OUT_CAL_QUEUE, Buffer.from(JSON.stringify(messageObj)), { persistent: true, type: 'btctx' },
          (err, ok) => {
            if (err !== null) {
              console.error(RMQ_WORK_OUT_CAL_QUEUE, '[calendar] publish message nacked')
              return callback(err)
            } else {
              console.log(RMQ_WORK_OUT_CAL_QUEUE, '[calendar] publish message acked')
              return callback(null)
            }
          })
      }
    ], function (err) {
      if (err) {
        // An error has occurred publishing the transaction, nack consumption of message
        console.error('error publishing transaction', err)
        // set a 30 second delay for nacking this message to prevent a flood of retries hitting bcoin
        setTimeout(() => {
          amqpChannel.nack(msg)
          console.error(RMQ_WORK_IN_QUEUE, 'consume message nacked')
        }, 30000)
      } else {
        amqpChannel.ack(msg)
        console.log(RMQ_WORK_IN_QUEUE, 'consume message acked')
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
        chan.assertQueue(RMQ_WORK_OUT_CAL_QUEUE, { durable: true })
        chan.prefetch(RMQ_PREFETCH_COUNT)
        amqpChannel = chan
        // Receive and process messages meant to initiate btc tx generation and publishing
        chan.consume(RMQ_WORK_IN_QUEUE, (msg) => {
          console.log('processing incoming message')
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

// Initialize amqp connection
amqpOpenConnection(RABBITMQ_CONNECT_URI)

// Continuous watch on the consul key holding the fee object.
var watch = consul.watch({ method: consul.kv.get, options: { key: BTC_REC_FEE_KEY } })

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
