// load all environment variables into env object
const env = require('./lib/parse-env.js')

const BEACON = require('nist-randomness-beacon')

const consul = require('consul')({host: env.CONSUL_HOST, port: env.CONSUL_PORT})

let getNistLatest = () => {
  BEACON.last((err, res) => {
    if (err) {
      console.error(err)
    } else {
      // console.log(res)

      if (res && res.timeStamp && res.seedValue) {
        let timeAndSeed = res.timeStamp.toString() + ':' + res.seedValue

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

// run at service start
getNistLatest()

// run at interval
setInterval(() => {
  try {
    getNistLatest()
  } catch (err) {
    console.error('getNistLatest : caught err : ', err.message)
  }
}, env.NIST_INTERVAL_MS)
