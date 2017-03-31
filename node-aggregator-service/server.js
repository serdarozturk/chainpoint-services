require('dotenv').config()

// Using DotEnv : https://github.com/motdotla/dotenv
// Expects AGGREGATION_INTERVAL environment variable
// Defaults to 1000ms if not present. Can set vars in
// `.env` file (do NOT commit to repo) or on command
// line:
//   AGGREGATION_INTERVAL=200 node server.js
//
const INTERVAL = process.env.AGGREGATION_INTERVAL || 1000

let aggregate = function () {
  console.log('merkling every %sms ...', INTERVAL)
}

// aggregate periodically
let timerId = setInterval(() => aggregate(), INTERVAL)
