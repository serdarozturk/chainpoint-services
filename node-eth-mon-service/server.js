// load all environment variables into env object
const env = require('./lib/parse-env.js')('eth-mon')
const ethTokenTxLog = require('./lib/models/EthTokenTrxLog.js')
const nodeRegistration = require('./lib/models/NodeRegistration.js')
const utils = require('./lib/utils.js')
const loadProvider = require('./loaders/providerLoader.js')
const loadToken = require('./loaders/tokenLoader.js')
const TokenOps = require('./loaders/tokenOps.js')

// pull in variables defined in shared EthTokenTrxLog module
let sequelize = ethTokenTxLog.sequelize
let EthTokenTxLog = ethTokenTxLog.BtcTxLog
let NodeRegistration = nodeRegistration.NodeRegistration

// Load the provider, token contract, and create the TokenOps class
let web3Provider = loadProvider(env.ETH_PROVIDER_URI)
let tokenContract = loadToken(web3Provider, env.ETH_TNT_TOKEN_ADDR)
let ops = new TokenOps(tokenContract)

let lastEventInfo = null

/**
 * Get the last incoming transfer of TNT tokens we have seen and return block number and trx index
 */
async function getLastKnownEventInfo () {
  // Get the latest incoming transfer from the DB
  let lastTranser = await EthTokenTxLog.findOne({
    where: { toAddress: env.ETH_TNT_LISTEN_ADDR },
    order: [[ 'createdAt', 'DESC' ]]
  })

  // Check to make sure one was found
  if (!lastTranser) {
    // Not found, so set to 0s
    return {
      blockNumber: 0,
      transactionIndex: 0
    }
  }

  // Return the valid info
  return {
    blockNumber: lastTranser.blockNumber,
    transactionIndex: lastTranser.transactionIndex
  }
}

async function setLastKnownEventInfo (params) {
  // Save off the last seen info to the local copy
  lastEventInfo = {
    blockNumber: params.blockNumber,
    transactionIndex: params.transactionIndex
  }

  let tx = {
    txId: params.transactionHash,
    transactionIndex: params.transactionIndex,
    blockNumber: params.blockNumber,
    fromAddress: params.args._from,
    toAddress: params.args._to,
    amount: params.args._value
  }

  return EthTokenTxLog.create(tx)
}

/**
 * When a node sends in TNT tokens, their account balance should be updated with credit.
 *
 * @param {string} nodeAddress
 * @param {bigint} tntAmount
 */
async function incrementNodeBalance (nodeAddress, tntAmount) {
  // Find the node that sent in the balance
  let node = await NodeRegistration.findOne({where: { tntAddr: nodeAddress }})

  if (!node) {
    console.err('Incoming TNT tokens were not mapped to any node: ' + nodeAddress)
    return
  }

  node.tntCredit += tntAmount
  return node.save()
}

/**
 * Check if the latestEventInfo comes after the block info in newEventInfo.
 *
 * @param {obj} latestEventInfo
 * @param {obj} newEventInfo
 */
function isNewEventOlder (latestEventInfo, newEventInfo) {
  // Check block number
  if (latestEventInfo.blockNumber > newEventInfo.blockNumber) {
    return true
  }

  // If block number is the same, check trx index
  if (latestEventInfo.blockNumber === newEventInfo.blockNumber &&
    latestEventInfo.transactionIndex > newEventInfo.transactionIndex) {
    return true
  }

  return false
}

/**
 * Initializes the token listener for incoming TNT token transfers.
 */
async function initListener () {
  // Get the last known event info and save it to a local var
  lastEventInfo = await getLastKnownEventInfo()

  // Start listening for incoming transactions
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
  if (isNewEventOlder(lastEventInfo, params)) {
    console.warn('Found an event that should have already been processed: ')
    console.warn(params)
    return
  }

  // Log out the transaction
  console.log('Transfer occurred on Block ' + params.blockNumber + ' From: ' + params.args._from + ' To: ' + params.args._to + ' AMT: ' + params.args._value)

  // Should take any action required when event is triggered here.
  incrementNodeBalance(params.args._from, params.args._value)

  // Save off block number here from latest seen event.
  setLastKnownEventInfo(params)
}

/**
 * Opens a storage connection
 **/
async function openStorageConnectionAsync (callback) {
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
  isNewEventOlder: isNewEventOlder
}