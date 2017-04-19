const amqp = require('amqplib')
const async = require('async')
const _ = require('lodash')
const sb = require('satoshi-bitcoin')
const coinTicker = require('coin-ticker')
require('dotenv').config()

const REDIS_CONNECT_URI = process.env.REDIS_CONNECT_URI || 'redis://redis:6379'
const r = require('redis')
const redis = r.createClient(REDIS_CONNECT_URI)

// See : https://github.com/ranm8/requestify
// Setup requestify to use Redis caching layer.
const requestify = require('requestify')
const coreCacheTransporters = requestify.coreCacheTransporters
requestify.cacheTransporter(coreCacheTransporters.redis(redis))

// The name of the RabbitMQ topic exchange to use
const RMQ_EXCHANGE_NAME = process.env.RMQ_EXCHANGE_NAME || 'work_topic_exchange'

// The topic exchange routing key for message publishing bound for the BTC transaction service
const RMQ_ROUTING_KEY = process.env.RMQ_ROUTING_KEY || 'btc.rec_fee'

// Connection string w/ credentials for RabbitMQ
const RABBITMQ_CONNECT_URI = process.env.RABBITMQ_CONNECT_URI || 'amqp://chainpoint:chainpoint@rabbitmq'

// API Docs : https://bitcoinfees.21.co/api
const REC_FEES_URI = process.env.REC_FEES_URI || 'https://bitcoinfees.21.co/api/v1/fees/recommended'

// The published key location where recommended fee will be stored
// for use by other services.
const BTC_REC_FEE_KEY = process.env.BTC_REC_FEE_KEY || 'btc_rec_fee'

// How long, in milliseconds, should cached values be kept for
// until a new HTTP GET is issued?
const CACHE_TTL = 1000 * 60 * 10 // in ms, cache response for 10 min

// The average size, in Bytes, for BTC transactions for anchoring
const AVG_TX_BYTES = 235

// The channel used for all amqp communication
// This value is set once the connection has been established
let amqpChannel = null

// Periodically updated with most current data from Bitcoin Exchange
let currentExchange = null

let getCurrentExchange = function () {
  coinTicker('bitfinex', 'btcusd').then(data => {
    // console.log('bitfinex exchange data : %s', JSON.stringify(data))
    currentExchange = data
  }).catch(err => {
    console.error('bitfinex call failed, failing over to bitstamp : %s', JSON.stringify(err))
    coinTicker('bitstamp', 'btcusd').then(data => {
      // console.log('bitstamp exchange data : %s', JSON.stringify(data))
      currentExchange = data
    }).catch(err => {
      // Could not reach two exchanges. Something is very wrong.
      console.error('bitstamp call failed : %s', JSON.stringify(err))
    })
  })
}

let genFeeRecObj = function (recFeeInSatoshiPerByte) {
  let feeSatForAvgTx = Math.ceil(AVG_TX_BYTES * recFeeInSatoshiPerByte)
  let feeBtcForAvgTx = sb.toBitcoin(feeSatForAvgTx)

  let obj = {}
  obj.recFeeInSatPerByte = recFeeInSatoshiPerByte
  obj.recFeeInSatForAvgTx = feeSatForAvgTx
  obj.recFeeInBtcForAvgTx = feeBtcForAvgTx

  // Include USD estimation if available
  if (_.has(currentExchange, 'last')) {
    let fee = _.parseInt(currentExchange.last) * feeBtcForAvgTx
    obj.recFeeInUsdForAvgTx = _.round(fee, 2)
  } else {
    obj.recFeeInUsdForAvgTx = null
  }

  obj.avgTxSizeBytes = AVG_TX_BYTES
  return obj
}

// HTTP GET and cache current fees from
let getRecommendedFees = function () {
  requestify.get(REC_FEES_URI, {
    cache: {
      cache: true,
      expires: CACHE_TTL
    }
  }).then(function (response) {
    // Sample return body:
    //   { "fastestFee": 40, "halfHourFee": 20, "hourFee": 10 }
    let responseBody = response.getBody()

    // Don't proceed, and exit to trigger investigation, if what we got back
    // from the API is not the expected structure or not a number value. It is
    // better for services dependent on that value to keep using the last stored
    // value than to remove/overwrite with a bad value.
    if (_.has(responseBody, 'fastestFee') && _.isNumber(responseBody.fastestFee)) {
      let selectedFee = _.parseInt(responseBody.fastestFee)
      let feeRecObj = genFeeRecObj(selectedFee)

      console.log('fee recommendations %s', JSON.stringify(feeRecObj))

      // Publish the recommended transaction fee data in a well known
      // location for use by any service with access to Redis.
      redis.set(BTC_REC_FEE_KEY, JSON.stringify(feeRecObj))

      // Also publish the recommended transaction fee data onto an RMQ
      // route that can be consumed by any interested services.
      let msg = new Buffer(JSON.stringify(feeRecObj))
      amqpChannel.publish(RMQ_EXCHANGE_NAME, RMQ_ROUTING_KEY, msg, function (err, ok) {
        if (err !== null) {
          console.error('RMQ publish failed : %s', JSON.stringify(err))
          process.exit(1)
        }
      })
    } else {
      // Bail out and let the service get restarted
      console.error('unexpected return value : %s', JSON.stringify(responseBody))
      process.exit(1)
    }
  }).fail(function (response) {
    // Bail out and let the service get restarted
    console.error('HTTP GET Error : %s : %s', response.getCode(), JSON.stringify(response))
    process.exit(1)
  })
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
      console.error('RMQ connection closed. Reconnecting in 5 seconds...')
      // channel is lost, reset to null
      amqpChannel = null
      setTimeout(amqpOpenConnection.bind(null, connectionString), 5 * 1000)
    })

    conn.createConfirmChannel().then(function (chan) {
      // the connection and channel have been established
      // set 'amqpChannel' so that publishers have access to the channel
      console.log('RMQ connection established')
      chan.assertExchange(RMQ_EXCHANGE_NAME, 'topic', { durable: true })
      amqpChannel = chan
    })
  }).catch(() => {
    // catch errors when attempting to establish connection
    console.error('Cannot establish connection. Attempting in 5 seconds...')
    setTimeout(amqpOpenConnection.bind(null, connectionString), 5 * 1000)
  })
}

// AMQP initialization
amqpOpenConnection(RABBITMQ_CONNECT_URI)

// get exchange rate at startup and periodically
getCurrentExchange()
setInterval(() => getCurrentExchange(), 1000 * 60 * 10) // 10 min

// get recommended fees at startup and periodically
// most will retrieve from cache and not hit external API
getRecommendedFees()
setInterval(() => getRecommendedFees(), 1000 * 5) // 5 seconds
