// load all environment variables into env object
const env = require('./lib/parse-env.js')('btc-fee')

const _ = require('lodash')
const sb = require('satoshi-bitcoin')
const coinTicker = require('coin-ticker')
const cnsl = require('consul')

// See : https://github.com/ranm8/requestify
// Setup requestify and its caching layer.
const requestify = require('requestify')
const coreCacheTransporters = requestify.coreCacheTransporters
requestify.cacheTransporter(coreCacheTransporters.inMemory())

let consul = null

// How long, in milliseconds, should cached values be kept for
// until a new HTTP GET is issued?
const CACHE_TTL = 1000 * 60 * 5 // in ms, cache response for 5 min

// The average size, in Bytes, for BTC transactions for anchoring
const AVG_TX_BYTES = 235

// Most current tick from current coin-ticker BTC Exchange
let exchangeTick = null

// Exchange API request limits:
//   bitfinex : 90/min : http://docs.bitfinex.com/docs
//   bitstamp : 600/10min : https://www.bitstamp.net/api/
let getExchangeTickAsync = async () => {
  try {
    let tick = await coinTicker('bitfinex', 'BTC_USD')
    console.log('exchange tick : %s', JSON.stringify(tick))
    exchangeTick = tick
    return
  } catch (error) {
    console.error('bitfinex call failed, failing over to bitstamp : %s', JSON.stringify(error))
  }
  try {
    let tick = await coinTicker('bitstamp', 'BTC_USD')
    console.log('exchange tick : %s', JSON.stringify(tick))
    exchangeTick = tick
    return
  } catch (error) {
    // Could not reach two exchanges. Something is very wrong.
    console.error('bitstamp call failed : %s', JSON.stringify(error))
  }
}

let genFeeRecObj = (recFeeInSatoshiPerByte) => {
  let feeSatForAvgTx = Math.ceil(AVG_TX_BYTES * recFeeInSatoshiPerByte)
  let feeBtcForAvgTx = sb.toBitcoin(feeSatForAvgTx)

  let obj = {}
  obj.recFeeInSatPerByte = recFeeInSatoshiPerByte
  obj.recFeeInSatForAvgTx = feeSatForAvgTx
  obj.recFeeInBtcForAvgTx = feeBtcForAvgTx

  // Include USD estimation if available
  if (_.has(exchangeTick, 'last')) {
    let fee = _.parseInt(exchangeTick.last) * feeBtcForAvgTx
    obj.recFeeInUsdForAvgTx = _.round(fee, 2)
  } else {
    obj.recFeeInUsdForAvgTx = null
  }

  obj.avgTxSizeBytes = AVG_TX_BYTES
  return obj
}

let getRecommendedFeesAsync = async () => {
  let response = null
  // 21.co API Rate Limit : 5000/hour : https://bitcoinfees.21.co/api
  try {
    response = await requestify.get(env.REC_FEES_URI, {
      cache: {
        cache: true,
        expires: CACHE_TTL
      }
    })
  } catch (error) {
    // Bail out and let the service get restarted
    console.error('HTTP GET Error : %s ', JSON.stringify(error))
    process.exit(1)
  }
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

    // console.log('fee recommendations %s', JSON.stringify(feeRecObj))

    // Publish the recommended transaction fee data in a well known
    // location for use by any service with access to consul.
    consul.kv.set(env.BTC_REC_FEE_KEY, JSON.stringify(feeRecObj), function (err, result) {
      if (err) throw err
    })
  } else {
    // Bail out and let the service get restarted
    console.error('unexpected return value : %s', JSON.stringify(responseBody))
    process.exit(1)
  }
}

async function startIntervalsAsync () {
  // get exchange rate at startup and periodically
  await getExchangeTickAsync()
  setInterval(async () => await getExchangeTickAsync(), 1000 * 60) // 1 min

  // get recommended fees at startup and periodically
  // most calls are served from cache and don't hit external API
  await getRecommendedFeesAsync()
  setInterval(async () => await getRecommendedFeesAsync(), 1000 * 60) // 1 min
}

// process all steps need to start the application
async function start () {
  if (env.NODE_ENV === 'test') return
  try {
    // init consul
    consul = cnsl({ host: env.CONSUL_HOST, port: env.CONSUL_PORT })
    console.log('Consul connection established')
    // init interval functions
    startIntervalsAsync()
    console.log('startup completed successfully')
  } catch (err) {
    console.error(`An error has occurred on startup: ${err}`)
    process.exit(1)
  }
}

// get the whole show started
start()
