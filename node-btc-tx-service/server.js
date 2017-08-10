// load all environment variables into env object
const env = require('./lib/parse-env.js')('btc-tx')

const amqp = require('amqplib')
const BlockchainAnchor = require('blockchain-anchor')
const btcTxLog = require('./lib/models/BtcTxLog.js')
const cnsl = require('consul')
const utils = require('./lib/utils.js')

let consul = null

// The channel used for all amqp communication
// This value is set once the connection has been established
let amqpChannel = null

// The local variable holding the Bitcoin recommended fee value, from Consul at key BTC_REC_FEE_KEY,
// pushed from consul and refreshed automatically when any update in value is made
// Sample BTCRecommendedFee Object ->
// {"recFeeInSatPerByte":240,"recFeeInSatForAvgTx":56400,"recFeeInBtcForAvgTx":0.000564,"recFeeInUsdForAvgTx":0.86,"avgTxSizeBytes":235}
var BTCRecommendedFee = null

// pull in variables defined in shared BtcTxLog module
let sequelize = btcTxLog.sequelize
let BtcTxLog = btcTxLog.BtcTxLog

// initialize blockchainanchor object
let anchor = new BlockchainAnchor({
  btcUseTestnet: true, // todo: revert back to false when INSIGHT_API_BASE_URI point to mainnet node
  service: 'insightapi',
  insightApiBase: env.INSIGHT_API_BASE_URI
})

// The write function used write all btc tx log events
let logBtcTxDataAsync = async (txResult) => {
  let row = {}
  row.txId = txResult.txId
  row.publishDate = txResult.publishDate
  row.rawTx = txResult.rawTx
  row.feeSatoshiPerByte = parseInt(txResult.feeSatoshiPerByte)
  row.feePaidSatoshi = parseInt(txResult.feePaidSatoshi)
  row.stackId = env.CHAINPOINT_CORE_BASE_URI

  try {
    let newRow = await BtcTxLog.create(row)
    console.log(`$BTC log : tx_id : ${newRow.get({ plain: true }).txId}`)
    return newRow.get({ plain: true })
  } catch (error) {
    throw new Error(`BTC log create error: ${error.message} : ${error.stack}`)
  }
}

/**
* Send a POST request to /wallet/:id/send with a POST body
* containing an OP_RETURN TX
*
* @param {string} hash - The hash to embed in an OP_RETURN
*/
const sendTxToBTCAsync = async (hash) => {
  let privateKeyWIF = env.BITCOIN_WIF
  let feeSatPerByte = 160 // if BTCRecommendedFee is not initalized, use a default value
  if (BTCRecommendedFee) {
    let feeSatPerByte = BTCRecommendedFee.recFeeInSatPerByte
    // of the fee exceeds the maximum, revert to BTC_MAX_FEE_SAT_PER_BYTE for the fee
    if (feeSatPerByte > env.BTC_MAX_FEE_SAT_PER_BYTE) {
      console.error(`Fee of ${feeSatPerByte} sat per byte exceeded BTC_MAX_FEE_SAT_PER_BYTE of ${env.BTC_MAX_FEE_SAT_PER_BYTE}`)
      feeSatPerByte = env.BTC_MAX_FEE_SAT_PER_BYTE
    }
  } else {
    console.error('BTCRecommendedFee not initialized, using default values')
  }
  let feeTotalSatoshi = feeSatPerByte * 235 // 235 represents the average transaction size in bytes

  let txResult
  try {
    txResult = await anchor.btcOpReturnAsync(privateKeyWIF, hash, feeTotalSatoshi)
    txResult.publishDate = Date.now()
    txResult.feeSatoshiPerByte = feeSatPerByte
    txResult.feePaidSatoshi = feeTotalSatoshi
    return txResult
  } catch (error) {
    throw new Error(`Error sending anchor transaction : ${error.message}`)
  }
}

/**
* Parses a message and performs the required work for that message
*
* @param {amqp message object} msg - The AMQP message received from the queue
*/
async function processIncomingAnchorJobAsync (msg) {
  if (msg !== null) {
    let messageObj = JSON.parse(msg.content.toString())
    // the value to be anchored, likely a merkle root hex string
    let anchorData = messageObj.anchor_agg_root

    // if amqpChannel is null for any reason, dont bother sending transaction until that is resolved, return error
    if (!amqpChannel) throw new Error('no amqpConnection available')
    // create and publish the transaction

    try {
      let txResult = await sendTxToBTCAsync(anchorData)
      // log the btc tx transaction
      let newLogEntry = await logBtcTxDataAsync(txResult)
      console.log(newLogEntry)
      // queue return message for calendar containing the new transaction information
      // adding btc transaction id and full transaction body to original message and returning
      messageObj.btctx_id = txResult.txId
      messageObj.btctx_body = txResult.rawTx
      amqpChannel.sendToQueue(env.RMQ_WORK_OUT_CAL_QUEUE, Buffer.from(JSON.stringify(messageObj)), { persistent: true, type: 'btctx' },
        (err, ok) => {
          if (err !== null) {
            console.error(env.RMQ_WORK_OUT_CAL_QUEUE, '[calendar] publish message nacked')
            throw new Error(err)
          } else {
            console.log(env.RMQ_WORK_OUT_CAL_QUEUE, '[calendar] publish message acked')
            amqpChannel.ack(msg)
          }
        })
    } catch (error) {
      // An error has occurred publishing the transaction, nack consumption of message
      // set a 30 second delay for nacking this message to prevent a flood of retries hitting insight api
      console.error(error.message)
      setTimeout(() => {
        amqpChannel.nack(msg)
        console.error(env.RMQ_WORK_IN_BTCTX_QUEUE, 'consume message nacked')
      }, 30000)
    }
  }
}

/**
 * Opens a storage connection
 **/
async function openStorageConnectionAsync (callback) {
  let dbConnected = false
  while (!dbConnected) {
    try {
      await sequelize.sync({ logging: false })
      console.log('Sequelize connection established')
      dbConnected = true
    } catch (error) {
      // catch errors when attempting to establish connection
      console.error('Cannot establish Sequelize connection. Attempting in 5 seconds...')
      await utils.sleep(5000)
    }
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
      chan.assertQueue(env.RMQ_WORK_IN_BTCTX_QUEUE, { durable: true })
      chan.assertQueue(env.RMQ_WORK_OUT_CAL_QUEUE, { durable: true })
      chan.prefetch(env.RMQ_PREFETCH_COUNT_BTCTX)
      amqpChannel = chan
      // Receive and process messages meant to initiate btc tx generation and publishing
      chan.consume(env.RMQ_WORK_IN_BTCTX_QUEUE, (msg) => {
        processIncomingAnchorJobAsync(msg)
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

// This initalizes all the consul watches and JS intervals
function startWatchesAndIntervals () {
  console.log('starting watches and intervals')

  // console.log('starting watches and intervals')
  // Continuous watch on the consul key holding the fee object.
  var watch = consul.watch({ method: consul.kv.get, options: { key: env.BTC_REC_FEE_KEY } })

  // Store the updated fee object on change
  watch.on('change', function (data, res) {
    if (data && data.Value) {
      // console.log('data:', data)
      BTCRecommendedFee = JSON.parse(data.Value)
      // console.log(BTCRecommendedFee)
    }
  })

  // Oops, something is wrong with consul
  // or the fee service key
  watch.on('error', function (err) {
    console.error('error:', err)
  })
}

// process all steps need to start the application
async function start () {
  if (env.NODE_ENV === 'test') return
  try {
    // init consul
    consul = cnsl({ host: env.CONSUL_HOST, port: env.CONSUL_PORT })
    console.log('Consul connection established')
    // init DB
    await openStorageConnectionAsync()
    // init RabbitMQ
    await openRMQConnectionAsync(env.RABBITMQ_CONNECT_URI)
    // init watches and interval functions
    startWatchesAndIntervals()
    console.log('startup completed successfully')
  } catch (err) {
    console.error(`An error has occurred on startup: ${err}`)
    process.exit(1)
  }
}

// get the whole show started
start()
