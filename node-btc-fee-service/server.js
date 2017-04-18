const amqp = require('amqplib')
const async = require('async')
const _ = require('lodash')
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
const RMQ_WORK_EXCHANGE_NAME = process.env.RMQ_WORK_EXCHANGE_NAME || 'work_topic_exchange'

// The topic exchange routing key for message publishing bound for the BTC transaction service
const RMQ_WORK_OUT_ROUTING_KEY = process.env.RMQ_WORK_OUT_ROUTING_KEY || 'work.btc.rec_tx_fee'

// Connection string w/ credentials for RabbitMQ
const RABBITMQ_CONNECT_URI = process.env.RABBITMQ_CONNECT_URI || 'amqp://chainpoint:chainpoint@rabbitmq'

// API Docs : https://bitcoinfees.21.co/api
const REC_FEES_URI = process.env.REC_FEES_URI || 'https://bitcoinfees.21.co/api/v1/fees/recommended'

// The published key location where recommended fee will be stored
// for use by other services.
const BTC_REC_TX_FEE_KEY = process.env.BTC_REC_TX_FEE_KEY || 'btc_rec_tx_fee'

// How frequently should this process tick (in milliseconds)
const TICK_FREQ = 1000 * 5

// How long, in milliseconds, should cached values be kept for
// until a new HTTP GET is issued?
const CACHE_TTL = 1000 * 60 * 10 // in ms, cache response for 10 min

// The channel used for all amqp communication
// This value is set once the connection has been established
let amqpChannel = null

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
    // value than to remove/overright with a bad value.
    if (_.has(responseBody, 'fastestFee') && _.isNumber(responseBody.fastestFee)) {
      let selectedFee = _.parseInt(responseBody.fastestFee)
      console.log('bitcoinfees.21.co recommends %d satoshis/byte', selectedFee)

      // Publish the recommended BTC Transaction fee in a well known location
      // for use by any service with access to Redis. Value is measured
      // in satoshis per byte that will result in desired response time.
      redis.set(BTC_REC_TX_FEE_KEY, selectedFee)

      // Publish the same value onto RMQ route that can be consumed by interested services
      let msg = new Buffer(JSON.stringify(selectedFee))
      amqpChannel.publish(RMQ_WORK_EXCHANGE_NAME, RMQ_WORK_OUT_ROUTING_KEY, msg, function (err, ok) {
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
      chan.assertExchange(RMQ_WORK_EXCHANGE_NAME, 'topic', { durable: true })
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

// check for update frequently, most will retrieve from cache
setInterval(() => getRecommendedFees(), TICK_FREQ)
