const _ = require('lodash')
const sb = require('satoshi-bitcoin')
const coinTicker = require('coin-ticker')
const Influx = require('influx')

// load all environment variables into env object
const env = require('./lib/parse-env.js')('btc-fee')

const consul = require('consul')({host: env.CONSUL_HOST, port: env.CONSUL_PORT})

// See : https://github.com/ranm8/requestify
// Setup requestify and its caching layer.
const requestify = require('requestify')
const coreCacheTransporters = requestify.coreCacheTransporters
requestify.cacheTransporter(coreCacheTransporters.inMemory())

// How long, in milliseconds, should cached values be kept for
// until a new HTTP GET is issued?
const CACHE_TTL = 1000 * 60 * 5 // in ms, cache response for 5 min

// The average size, in Bytes, for BTC transactions for anchoring
const AVG_TX_BYTES = 235

// Most current tick from current coin-ticker BTC Exchange
let exchangeTick = null

const influx = new Influx.InfluxDB({
  host: env.INFLUXDB_HOST,
  database: env.INFLUXDB_DB,
  port: env.INFLUXDB_PORT,
  schema: [
    {
      measurement: 'btc_fee_tick',
      fields: {
        last: Influx.FieldType.FLOAT,
        ask: Influx.FieldType.FLOAT,
        bid: Influx.FieldType.FLOAT,
        low: Influx.FieldType.FLOAT,
        high: Influx.FieldType.FLOAT,
        vol: Influx.FieldType.FLOAT,
        timestamp: Influx.FieldType.FLOAT,
        exchange: Influx.FieldType.STRING,
        pair: Influx.FieldType.STRING
      },
      tags: ['exchange']
    },
    {
      measurement: 'btc_fee_rec',
      fields: {
        recFeeInSatPerByte: Influx.FieldType.INTEGER,
        recFeeInSatForAvgTx: Influx.FieldType.INTEGER,
        recFeeInBtcForAvgTx: Influx.FieldType.FLOAT,
        recFeeInUsdForAvgTx: Influx.FieldType.FLOAT,
        avgTxSizeBytes: Influx.FieldType.INTEGER
      },
      tags: []
    }
  ]
})

// Create InfluxDB database lazily
influx.getDatabaseNames().then(names => {
  if (!names.includes(env.INFLUXDB_DB)) {
    return influx.createDatabase(env.INFLUXDB_DB)
  }
})
.then(created => {
  influx.createRetentionPolicy('90d', {
    database: env.INFLUXDB_DB,
    duration: '90d',
    replication: 1,
    isDefault: true
  })
})
.catch(() => {
  console.error(`Error creating Influx database!`)
})

let influxLogTick = (tick) => {
  influx.writePoints([
    {
      measurement: 'btc_fee_tick',
      fields: tick,
      tags: { exchange: tick.exchange }
    }
  ]).catch(err => {
    console.error(`Error saving data to InfluxDB! ${err.stack}`)
  })
}

let influxLogFeeRec = (feeRecObj) => {
  influx.writePoints([
    {
      measurement: 'btc_fee_rec',
      fields: feeRecObj
    }
  ]).catch(err => {
    console.error(`Error saving data to InfluxDB! ${err.stack}`)
  })
}

// Exchange API request limits:
//   bitfinex : 90/min : http://docs.bitfinex.com/docs
//   bitstamp : 600/10min : https://www.bitstamp.net/api/
let getExchangeTick = () => {
  coinTicker('bitfinex', 'btcusd')
  .then((tick) => {
    // console.log('bitfinex exchange tick : %s', JSON.stringify(tick))
    exchangeTick = tick
    influxLogTick(tick)
  }).catch((err) => {
    console.error('bitfinex call failed, failing over to bitstamp : %s', JSON.stringify(err))

    coinTicker('bitstamp', 'btcusd').then((tick) => {
      // console.log('bitstamp exchange tick : %s', JSON.stringify(tick))
      exchangeTick = tick
      influxLogTick(tick)
    }).catch((err) => {
      // Could not reach two exchanges. Something is very wrong.
      console.error('bitstamp call failed : %s', JSON.stringify(err))
    })
  })
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

let getRecommendedFees = () => {
  // 21.co API Rate Limit : 5000/hour : https://bitcoinfees.21.co/api
  requestify.get(env.REC_FEES_URI, {
    cache: {
      cache: true,
      expires: CACHE_TTL
    }
  }).then((response) => {
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
      influxLogFeeRec(feeRecObj)

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
  }).fail((response) => {
    // Bail out and let the service get restarted
    console.error('HTTP GET Error : %s : %s', response.getCode(), JSON.stringify(response))
    process.exit(1)
  })
}

// get exchange rate at startup and periodically
getExchangeTick()
setInterval(() => getExchangeTick(), 1000 * 60) // 1 min

// get recommended fees at startup and periodically
// most calls are served from cache and don't hit external API
getRecommendedFees()
setInterval(() => getRecommendedFees(), 1000 * 60) // 1 min
