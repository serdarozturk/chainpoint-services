// load all environment variables into env object
const env = require('./lib/parse-env.js')('nist')

const BEACON = require('nist-randomness-beacon')
const cnsl = require('consul')

let consul = null

let getNistLatest = () => {
  BEACON.last((err, res) => {
    if (err) {
      console.error(err)
    } else {
      // Only collect beacon with valid signature!
      if (res && res.timeStamp && res.seedValue && res.validSignature) {
        let timeAndSeed = `${res.timeStamp.toString()}:${res.seedValue}`.toLowerCase()

        // The latest NIST value will always be stored under
        // a known key which can always be used if present.
        // It will be updated every minute if the service API
        // is available. Clients that are watching this key
        // should gracefully handle null values for this key.
        consul.kv.get(env.NIST_KEY, function (err, result) {
          if (err) {
            console.error(err)
          } else {
            // Only write to the key if the value changed.
            if (timeAndSeed !== result) {
              console.log(timeAndSeed)
              consul.kv.set(env.NIST_KEY, timeAndSeed, function (err, result) {
                if (err) throw err
              })
            }
          }
        })
      }
    }
  })
}

function startIntervals () {
  setInterval(() => {
    try {
      getNistLatest()
    } catch (err) {
      console.error('getNistLatest : caught err : ', err.message)
    }
  }, env.NIST_INTERVAL_MS)
}

async function start () {
  if (env.NODE_ENV === 'test') return
  try {
    // init consul
    consul = cnsl({ host: env.CONSUL_HOST, port: env.CONSUL_PORT })
    console.log('Consul connection established')
    // get initial value for service start
    getNistLatest()
    // init interval functions
    startIntervals()
    console.log('startup completed successfully')
  } catch (err) {
    console.error(`An error has occurred on startup: ${err}`)
    process.exit(1)
  }
}

start()
