// load all environment variables into env object
const env = require('./lib/parse-env.js')('eth-mon')

const { promisify } = require('util')
const restify = require('restify')
const corsMiddleware = require('restify-cors-middleware')
const ethTokenTxLog = require('./lib/models/EthTokenTrxLog.js')
const nodeRegistration = require('./lib/models/NodeRegistration.js')
const utils = require('./lib/utils.js')
const loadProvider = require('./loaders/providerLoader.js')
const loadToken = require('./loaders/tokenLoader.js')
const TokenOps = require('./tokenOps.js')
const _ = require('lodash')
var BigNumber = require('bignumber.js')

// pull in variables defined in shared EthTokenTrxLog module
let sequelize = ethTokenTxLog.sequelize
let EthTokenTxLog = ethTokenTxLog.EthTokenLog
let NodeRegistration = nodeRegistration.NodeRegistration

// The provider, token contract, and create the TokenOps class
let web3Provider = null
let tokenContract = null
let ops = null

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
    // NOTE - If a node sends in TNT before it registers... it will not get counted.
    console.error('Incoming TNT tokens were not mapped to any node: ' + nodeAddress)
    return
  }

  console.log(`Updating node ${node.tntAddr} credit ${node.tntCredit} with amount ${tntAmount}`)
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

  console.log('Listening for incoming TNT tokens to: ' + env.ETH_TNT_LISTEN_ADDR)

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

// RESTIFY SETUP
// 'version' : all routes will default to this version
let server = restify.createServer({
  name: 'eth-tx',
  version: '1.0.0'
})

// Clean up sloppy paths like //todo//////1//
server.pre(restify.pre.sanitizePath())

// Checks whether the user agent is curl. If it is, it sets the
// Connection header to "close" and removes the "Content-Length" header
// See : http://restify.com/#server-api
server.pre(restify.pre.userAgentConnection())

// CORS
// See : https://github.com/TabDigital/restify-cors-middleware
// See : https://github.com/restify/node-restify/issues/1151#issuecomment-271402858
//
// Test w/
//
// curl \
// --verbose \
// --request OPTIONS \
// http://127.0.0.1:8080/hashes \
// --header 'Origin: http://localhost:9292' \
// --header 'Access-Control-Request-Headers: Origin, Accept, Content-Type' \
// --header 'Access-Control-Request-Method: POST'
//
var cors = corsMiddleware({
  preflightMaxAge: 600,
  origins: ['*']
})
server.pre(cors.preflight)
server.use(cors.actual)

server.use(restify.gzipResponse())
server.use(restify.queryParser())
server.use(restify.bodyParser({
  maxBodySize: env.MAX_BODY_SIZE
}))

// API RESOURCES

// validate hashes are individually well formed
let isEthereumAddr = (address) => {
  return /^0x[0-9a-fA-F]{40}$/i.test(address)
}

// get the TNT balance of node
server.get({ path: '/balance/:tnt_addr/', version: '1.0.0' }, (req, res, next) => {
  // Verify address
  if (!req.params.hasOwnProperty('tnt_addr')) {
    return next(new restify.InvalidArgumentError('invalid JSON body, missing tnt_addr'))
  }

  if (_.isEmpty(req.params.tnt_addr)) {
    return next(new restify.InvalidArgumentError('invalid JSON body, empty tnt_addr'))
  }

  if (!isEthereumAddr(req.params.tnt_addr)) {
    return next(new restify.InvalidArgumentError('invalid JSON body, malformed tnt_addr'))
  }

  ops.getBalance(req.params.tnt_addr, (error, balance) => {
    if (error) {
      console.error(error)
      return next(new restify.InternalServerError('server error'))
    }

    res.send({
      balance: balance
    })
    return next()
  })
})

// send TNT to an address
server.post({ path: '/transfer/', version: '1.0.0' }, (req, res, next) => {
  if (req.contentType() !== 'application/json') {
    return next(new restify.InvalidArgumentError('invalid content type'))
  }

  // Verify address
  if (!req.params.hasOwnProperty('to_addr')) {
    return next(new restify.InvalidArgumentError('invalid JSON body, missing to_addr'))
  }

  if (_.isEmpty(req.params.to_addr)) {
    return next(new restify.InvalidArgumentError('invalid JSON body, empty to_addr'))
  }

  if (!isEthereumAddr(req.params.to_addr)) {
    return next(new restify.InvalidArgumentError('invalid JSON body, malformed to_addr'))
  }

  // Verify value
  if (!req.params.hasOwnProperty('value')) {
    return next(new restify.InvalidArgumentError('invalid JSON body, missing \'value\''))
  }

  if (_.isEmpty(req.params.value)) {
    return next(new restify.InvalidArgumentError('invalid JSON body, empty \'value\''))
  }

  let val = new BigNumber(req.params.value)

  if (val.isNaN()) {
    return next(new restify.InvalidArgumentError('invalid number specified for \'value\''))
  }

  ops.sendTokens(req.params.to_addr, val.valueOf(), (error, result) => {
    // Check for error
    if (error) {
      console.error(error)
      return next(new restify.InternalServerError('server error'))
    }

    res.send({
      trx_id: result
    })
    return next()
  })
})

// Instruct REST server to begin listening for request
function listenRestify (callback) {
  server.listen(8085, (err) => {
    if (err) return callback(err)
    console.log(`${server.name} listening at ${server.url}`)
    return callback(null)
  })
}
// make awaitable async version for startListening function
let listenRestifyAsync = promisify(listenRestify)

// process all steps need to start the application
async function start () {
  if (env.NODE_ENV === 'test') return
  try {
    // Init the token objects
    web3Provider = loadProvider(env.ETH_PROVIDER_URI)
    tokenContract = await loadToken(web3Provider, env.ETH_TNT_TOKEN_ADDR)
    ops = new TokenOps(tokenContract)

    // init DB
    await openStorageConnectionAsync()

    // Init Restify
    await listenRestifyAsync()

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
