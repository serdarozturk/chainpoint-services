// load all environment variables into env object
const env = require('./lib/parse-env.js')
const _ = require('lodash')
const nodeRegistration = require('./lib/models/NodeRegistration.js')
const utils = require('./lib/utils.js')

// pull in variables defined in shared CalendarBlock module
let sequelize = nodeRegistration.sequelize
let NodeRegistration = nodeRegistration.NodeRegistration

// See : https://github.com/ranm8/requestify
// Setup requestify and its caching layer.
const requestify = require('requestify')
const coreCacheTransporters = requestify.coreCacheTransporters
requestify.cacheTransporter(coreCacheTransporters.inMemory())

// How often to query the DB for stale nodes
// const CHECK_STALE_INTERVAL_MS = 1000 * 60 // 1 min
const CHECK_STALE_INTERVAL_MS = 1000

// How old must a node's timestamp be to be considered stale
const STALE_AFTER_MS = 1000 * 60 * 60 // 1 hour

// Retrieve all registered Nodes that have out of date
// audit results. Nodes should be audited hourly.
let getStaleAuditNodes = async () => {
  console.log('AUDITING', STALE_AFTER_MS)
}

async function startIntervalsAsync () {
  await getStaleAuditNodes()
  setInterval(async () => await getStaleAuditNodes(), CHECK_STALE_INTERVAL_MS)
}

/**
 * Opens a storage connection
 **/
async function openStorageConnectionAsync () {
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

// process all steps need to start the application
async function start () {
  if (env.NODE_ENV === 'test') return
  try {
    // init DB
    await openStorageConnectionAsync()

    // start main processing
    await startIntervalsAsync()
    console.log('startup completed successfully')
  } catch (err) {
    console.error(`An error has occurred on startup: ${err}`)
    process.exit(1)
  }
}

// get the whole show started
start()
