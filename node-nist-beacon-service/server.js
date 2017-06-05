require('dotenv').config()

const BEACON = require('nist-randomness-beacon')

const CONSUL_HOST = process.env.CONSUL_HOST || 'consul'
const CONSUL_PORT = process.env.CONSUL_PORT || 8500
const consul = require('consul')({host: CONSUL_HOST, port: CONSUL_PORT})

const NIST_INTERVAL_MS = process.env.NIST_INTERVAL_MS || 60000
const NIST_KEY = process.env.NIST_KEY || 'service/nist/latest'

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
        consul.kv.get(NIST_KEY, function (err, result) {
          if (err) {
            console.error(err)
          } else {
            // Only write to the key if the value changed.
            if (timeAndSeed !== result) {
              console.log(timeAndSeed)
              consul.kv.set(NIST_KEY, timeAndSeed, function (err, result) {
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
}, NIST_INTERVAL_MS)
