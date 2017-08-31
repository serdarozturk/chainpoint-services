// load all environment variables into env object
const env = require('./lib/parse-env.js')('eth-tnt-listener')

const ethTokenTxLog = require('./lib/models/EthTokenTrxLog.js')
const registeredNode = require('./lib/models/RegisteredNode.js')
const utils = require('./lib/utils.js')
const loadProvider = require('./lib/eth-tnt/providerLoader.js')
const loadToken = require('./lib/eth-tnt/tokenLoader.js')
const TokenOps = require('./lib/eth-tnt/tokenOps.js')
const BigNumber = require('bignumber.js')

// pull in variables defined in shared EthTokenTrxLog module
let ethTokenTxSequelize = ethTokenTxLog.sequelize
let EthTokenTxLog = ethTokenTxLog.EthTokenLog
let registeredNodeSequelize = ethTokenTxLog.sequelize
let RegisteredNode = registeredNode.RegisteredNode

// The provider, token contract, and create the TokenOps class
let web3Provider = null
let tokenContract = null
let ops = null

let lastEventInfo = null

/**
 * Get the last incoming transfer of TNT tokens we have seen and return block number and trx index
 */
async function getLastKnownEventInfoAsync () {
  let addresses = env.ETH_TNT_LISTEN_ADDRS.split(',')

  // Get the latest incoming transfer from the DB
  let lastTransfer = await EthTokenTxLog.findOne({
    where: { toAddress: addresses },
    order: [[ 'createdAt', 'DESC' ]]
  })

  // Check to make sure one was found or we are in developement mode
  if (!lastTransfer || env.NODE_ENV === 'development') {
    // Not found, so set to 0s
    return {
      blockNumber: 0,
      transactionIndex: 0
    }
  }

  // Return the valid info
  return {
    blockNumber: lastTransfer.blockNumber,
    transactionIndex: lastTransfer.transactionIndex
  }
}

async function setLastKnownEventInfoAsync (params) {
  // Save off the last seen info to the local copy
  lastEventInfo = {
    blockNumber: params.blockNumber,
    transactionIndex: params.transactionIndex
  }

  let tx = {
    txId: params.transactionHash,
    transactionIndex: params.transactionIndex,
    blockNumber: params.blockNumber,
    fromAddress: params.args.from,
    toAddress: params.args.to,
    amount: params.args.value
  }

  // TODO : Possibly wrap this create with the crediting of balance into a single transaction
  // for error case of rollback.
  return EthTokenTxLog.create(tx)
}

/**
 * Converts TNT token amount (in grains) to credit value
 * @param  {number} tntAmount Grains of TNT to convert
 * @return {number}           Amount of credits
 */
function convertTntToCredit (tntAmount) {
  return new BigNumber(tntAmount).times(env.TNT_TO_CREDIT_RATE).dividedBy(new BigNumber(10).toPower(8)).toNumber()
}

/**
 * When a node sends in TNT tokens, their account balance should be updated with credit.
 *
 * @param {string} nodeAddress
 * @param {bigint} tntAmount
 */
async function incrementNodeBalanceAsync (nodeAddress, tntAmount) {
  // Find the node that sent in the balance
  let node = await RegisteredNode.findOne({where: { tntAddr: nodeAddress }})

  if (!node) {
    // TODO - Store unkowns for later processing if node registers after sending in for some reason

    // NOTE - If a node sends in TNT before it registers... it will not get counted.
    console.error('Incoming TNT tokens were not mapped to any node: ' + nodeAddress)
    return
  }

  // Convert the TNT to credits
  let credits = convertTntToCredit(tntAmount)

  console.log(`Incrementing node ${node.tntAddr} with current credit ${node.tntCredit} by amount ${credits}`)
  node.tntCredit += credits
  return await node.save()
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
async function initListenerAsync () {
  // Get the last known event info and save it to a local var
  lastEventInfo = await getLastKnownEventInfoAsync()

  console.log('Listening for incoming TNT tokens to: ' + env.ETH_TNT_LISTEN_ADDRS + ' starting at block ' + JSON.stringify(lastEventInfo))

  // Start listening for incoming transactions
  ops.watchForTransfers(env.ETH_TNT_LISTEN_ADDRS.split(','), lastEventInfo.blockNumber, incomingTokenTransferEvent)
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
  console.log('Transfer occurred on Block ' + params.blockNumber + ' From: ' + params.args.from + ' To: ' + params.args.to + ' AMT: ' + params.args.value)

  // Should take any action required when event is triggered here.
  incrementNodeBalanceAsync(params.args.from, params.args.value)

  // Save off block number here from latest seen event.
  setLastKnownEventInfoAsync(params)
}

/**
 * Opens a storage connection
 **/
async function openStorageConnectionAsync (callback) {
  let dbConnected = false
  while (!dbConnected) {
    try {
      await ethTokenTxSequelize.sync({ logging: false })
      await registeredNodeSequelize.sync({ logging: false })
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
    // Init the token objects
    console.log('Calling loadProvider: ' + env.ETH_PROVIDER_URI)
    web3Provider = loadProvider(env.ETH_PROVIDER_URI)
    console.log('Calling loadToken')
    tokenContract = await loadToken(web3Provider, env.ETH_TNT_TOKEN_ADDR)
    ops = new TokenOps(tokenContract)

    // init DB
    await openStorageConnectionAsync()

    // init event listener
    await initListenerAsync()

    console.log('startup completed successfully')
  } catch (err) {
    console.error(`An error has occurred on startup: ${err}`)
    process.exit(1)
  }
}

// get the whole show started - wait 10 seconds for contracts to be deployed
setTimeout(start, 10000)

// export these functions for unit tests
module.exports = {
  isNewEventOlder: isNewEventOlder
}
