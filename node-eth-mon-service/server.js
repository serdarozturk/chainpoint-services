// load all environment variables into env object
const env = require('./lib/parse-env.js')('eth-mon')

const loadProvider = require('./loaders/providerLoader.js')
const loadToken = require('./loaders/tokenLoader.js')
const TokenOps = require('./loaders/tokenOps.js')

// Load the provider, token contract, and create the TokenOps class
let web3Provider = loadProvider(env.ETH_PROVIDER_URI)
let tokenContract = loadToken(web3Provider, env.ETH_TNT_TOKEN_ADDR)
let ops = new TokenOps(tokenContract)

let lastEventInfo = null

function getLastKnowEvent () {
  // TODO: Get it from storage - set to 0 if not found
  return {
    blockNumber: 0,
    transactionIndex: 0
  }
}

function setLastKnowEvent (blockNumber, transactionIndex) {
  // Save off the last seen info to the local copy
  lastEventInfo = {
    blockNumber: blockNumber,
    transactionIndex: transactionIndex
  }

  // TODO: Save it off to storage

  return true
}

function incrementNodeBalance (nodeAddress, tntAmount) {
  return
}

/**
 * Check if the latestEventInfo comes after the block info in params.
 *
 * @param {obj} latestEventInfo
 * @param {obj} params
 */
function isEventPrevious (latestEventInfo, params) {
  // Check block number
  if (latestEventInfo.blockNumber > params.blockNumber) {
    return true
  }

  // If block number is the same, check trx index
  if (latestEventInfo.blockNumber === params.blockNumber &&
    latestEventInfo.transactionIndex > params.transactionIndex) {
    return true
  }

  return false
}

/**
 * Initializes the token listener for incoming TNT token transfers.
 */
function initListener () {
  // Get the last known event info and save it to a local var
  lastEventInfo = getLastKnowEvent()

  ops.watchForTransfers(env.ETH_TNT_LISTEN_ADDR, lastEventInfo.blockNumber, incomingTokenTransferEvent)
}

/**
 * This is the callback fired when a transfer of TNT tokens is found
 * to come to the account[0] on the web3 provider.
 *
 * @param {obj} error
 * @param {obj} params
 */
function incomingTokenTransferEvent (error, params) {
  // Check for error
  if (error) {
    console.error(error)
    process.exit(-1)
  }

  // Ensure it is not before the last seen trx
  if (isEventPrevious(lastEventInfo, params)) {
    console.warn('Found an event that should have already been processed: ')
    console.warn(params)
    return
  }

  // Log out the transaction
  console.log('Trasfer occurred on Block ' + params.blockNumber + ' From: ' + params.args._from + ' To: ' + params.args._to + ' AMT: ' + params.args._value)

  // Should take any action required when event is triggered here.
  incrementNodeBalance(params.args._from, params.args._value)

  // Save off block number here from latest seen event.
  setLastKnowEvent(params.blockNumber, params.transactionIndex)
}

// process all steps need to start the application
async function start () {
  if (env.NODE_ENV === 'test') return
  try {
    // init event listener
    initListener()

    console.log('startup completed successfully')
  } catch (err) {
    console.error(`An error has occurred on startup: ${err}`)
    process.exit(1)
  }
}

// get the whole show started
start()

// export these functions for unit tests
module.exports = {
  incomingTokenTransferEvent: incomingTokenTransferEvent,
  isEventPrevious: isEventPrevious
}
