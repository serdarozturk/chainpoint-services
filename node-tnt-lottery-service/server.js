// load all environment variables into env object
const env = require('./lib/parse-env.js')('tnt-lottery')

const utils = require('./lib/utils')
const amqp = require('amqplib')
const rp = require('request-promise-native')
const nodeAuditLog = require('./lib/models/NodeAuditLog.js')
const csprng = require('random-number-csprng')
const bigNumber = require('bignumber')

// The channel used for all amqp communication
// This value is set once the connection has been established
var amqpChannel = null

// pull in variables defined in shared database models
let nodeAuditSequelize = nodeAuditLog.sequelize
let NodeAuditLog = nodeAuditLog.NodeAuditLog

// Randomly select and deliver tokens to a lottery winner from the list
// of registered nodes that meet the minimum audit and tnt balance
// eligability requirements for receiving TNT awards
async function performLotteryAsync () {
  let minAuditPasses = env.MIN_CONSECUTIVE_AUDIT_PASSES_FOR_AWARD
  let minGrainsBalanceNeeded = env.MIN_TNT_GRAINS_BALANCE_FOR_AWARD
  let tntGrainsAward = env.TNT_GRAINS_PER_LOTTERY_AWARD
  let ethTntTxUri = '??' // TODO: Complete

  // find all audit qualifying registered Nodes
  let auditCheckRangeSeconds = minAuditPasses * 30 * 60 // minAuditPasses * 30 minute audit interval
  let auditsFromDateEpoch = Date.now() - auditCheckRangeSeconds
  let qualifiedNodes
  try {
    // SELECT all tnt addresses in the audit log that have minAuditPasses full pass entries since auditsFromDateEpoch
    qualifiedNodes = await NodeAuditLog.findAll({
      attributes: ['tntAddr'],
      where: { auditAt: { $gte: auditsFromDateEpoch }, publicIPPass: true, timePass: true, calStatePass: true },
      group: 'tntAddr',
      having: ['COUNT(?)>=?', 'tntAddr', minAuditPasses],
      raw: true
    })
    if (!qualifiedNodes || qualifiedNodes.length < 1) {
      console.log('No qualifying Nodes were found for lottery selection')
      return
    } else {
      console.log(`${qualifiedNodes.length} qualifying Nodes were found for lottery selection`)
    }
  } catch (error) {
    console.error(`Audit Log read error : ${error.message}`)
    return
  }

  // randomly select lottery winner from qualifying Nodes
  let selectionIndex = await csprng(0, qualifiedNodes.length - 1)
  let selectedNodeETHAddr = qualifiedNodes[selectionIndex].tntAddr

  // if the selected Node does not have a sufficient minimum TNT balance,
  // remove the Node from the qualifying list and make new random selection
  let winnerNodeETHAddr = null

  while (!winnerNodeETHAddr) {
    let options = {
      headers: [
        {
          name: 'Content-Type',
          value: 'application/json'
        }
      ],
      method: 'GET',
      uri: `${ethTntTxUri}/balance/${selectedNodeETHAddr}`,
      json: true,
      gzip: true,
      resolveWithFullResponse: true
    }

    try {
      let balanceResponse = await rp(options)
      if (balanceResponse.balance < minGrainsBalanceNeeded) {
        // disqualified, TNT balance too low, log occurance, remove from qualified list, perform new selection
        console.log(`${selectedNodeETHAddr} was selected, but was disqualified due to a low TNT balance of ${balanceResponse.balance}, ${minGrainsBalanceNeeded} is required.`)
        qualifiedNodes.splice(selectionIndex, 1)
        if (qualifiedNodes.length === 0) {
          console.log(`Qualifying Nodes were found for lottery selection, but none had a sufficient TNT balance, ${minGrainsBalanceNeeded} is required.`)
          return
        }
        selectionIndex = await csprng(0, qualifiedNodes.length - 1)
        selectedNodeETHAddr = qualifiedNodes[selectionIndex].tntAddr
      } else {
        winnerNodeETHAddr = selectedNodeETHAddr
      }
    } catch (error) {
      console.error(`TNT balance read error : ${error.message}`)
      return
    }
  }

  // calculate award share between Node and Core (if applicable)
  let nodeAwardShare = tntGrainsAward
  let coreAwardShare = 0
  let coreAwardEthAddr = null
  // TODO: determine Core share when appropriate
  // TODO: Use correct Core target ETH address
  if (false) {
    nodeAwardShare = bigNumber(tntGrainsAward).times(0.95).toNumber()
    coreAwardShare = tntGrainsAward - nodeAwardShare
    coreAwardEthAddr = ''
  }
  let nodeAwardTxId = null
  let coreAwardTxId = null

  // award TNT to ETH address for winning Node
  let postObject = {
    to_addr: winnerNodeETHAddr,
    value: nodeAwardShare
  }

  let options = {
    headers: [
      {
        name: 'Content-Type',
        value: 'application/json'
      }
    ],
    method: 'POST',
    uri: `${ethTntTxUri}/transfer`,
    body: postObject,
    json: true,
    gzip: true,
    resolveWithFullResponse: true
  }

  try {
    let awardResponse = await rp(options)
    nodeAwardTxId = awardResponse.trx_id
    console.log(`${nodeAwardShare} TNT grains awarded to Node using ETH address ${winnerNodeETHAddr} in transaction ${nodeAwardTxId}`)
  } catch (error) {
    console.error(`${nodeAwardShare} TNT grains failed to be awarded to Node using ETH address ${winnerNodeETHAddr} : ${error.message}`)
  }

  // award TNT to Core operator (if applicable)
  if (coreAwardShare > 0) {
    let postObject = {
      to_addr: coreAwardEthAddr,
      value: coreAwardShare
    }

    let options = {
      headers: [
        {
          name: 'Content-Type',
          value: 'application/json'
        }
      ],
      method: 'POST',
      uri: `${ethTntTxUri}/transfer`,
      body: postObject,
      json: true,
      gzip: true,
      resolveWithFullResponse: true
    }

    try {
      let awardResponse = await rp(options)
      coreAwardTxId = awardResponse.trx_id
      console.log(`${coreAwardShare} TNT grains awarded to Core using ETH address ${coreAwardEthAddr} in transaction ${coreAwardTxId}`)
    } catch (error) {
      console.error(`${coreAwardShare} TNT grains failed to be awarded to Core using ETH address ${coreAwardEthAddr} : ${error.message}`)
    }
  }

  // send lottery result message to Calendar
  let messageObj = {}
  messageObj.node = {}
  messageObj.node.address = winnerNodeETHAddr
  messageObj.node.amount = nodeAwardShare
  messageObj.node.eth_tx_id = nodeAwardTxId
  if (coreAwardShare > 0) {
    messageObj.core = {}
    messageObj.core.address = coreAwardEthAddr
    messageObj.core.amount = coreAwardShare
    messageObj.core.eth_tx_id = coreAwardTxId
  }

  try {
    await amqpChannel.sendToQueue(env.RMQ_WORK_OUT_CAL_QUEUE, Buffer.from(JSON.stringify(messageObj)), { persistent: true, type: 'lottery' })
    console.log(env.RMQ_WORK_OUT_CAL_QUEUE, '[lottery] publish message acked')
  } catch (error) {
    console.error(env.RMQ_WORK_OUT_CAL_QUEUE, '[lottery] publish message nacked')
    throw new Error(error.message)
  }
}

// This initalizes all the JS intervals that fire all aggregator events
function startIntervals () {
  console.log('starting intervals')

  // PERIODIC TIMERS

  setInterval(() => performLotteryAsync(), env.LOTTERY_FREQUENCY_SECONDS * 1000)
}

/**
 * Opens an AMPQ connection and channel
 * Retry logic is included to handle losses of connection
 *
 * @param {string} connectionString - The connection URI for the RabbitMQ instance
 */
async function openRMQConnectionAsync (connectionString) {
  let rmqConnected = false
  while (!rmqConnected) {
    try {
      // connect to rabbitmq server
      let conn = await amqp.connect(connectionString)
      // create communication channel
      let chan = await conn.createConfirmChannel()
      // the connection and channel have been established
      chan.assertQueue(env.RMQ_WORK_OUT_CAL_QUEUE, { durable: true })
      // set 'amqpChannel' so that publishers have access to the channel
      amqpChannel = chan
      // if the channel closes for any reason, attempt to reconnect
      conn.on('close', async () => {
        console.error('Connection to RMQ closed.  Reconnecting in 5 seconds...')
        amqpChannel = null
        await utils.sleep(5000)
        await openRMQConnectionAsync(connectionString)
      })
      console.log('RabbitMQ connection established')
      rmqConnected = true
    } catch (error) {
      // catch errors when attempting to establish connection
      console.error('Cannot establish RabbitMQ connection. Attempting in 5 seconds...')
      await utils.sleep(5000)
    }
  }
}

/**
 * Opens a storage connection
 **/
async function openStorageConnectionAsync () {
  let dbConnected = false
  while (!dbConnected) {
    try {
      await nodeAuditSequelize.sync({ logging: false })
      console.log('Sequelize connection established')
      dbConnected = true
    } catch (error) {
      // catch errors when attempting to establish connection
      console.error('Cannot establish Sequelize connection. Attempting in 5 seconds...')
      console.error(error.message)
      await utils.sleep(5000)
    }
  }
}

// process all steps need to start the application
async function start () {
  if (env.NODE_ENV === 'test') return
  try {
    // init rabbitMQ
    await openRMQConnectionAsync(env.RABBITMQ_CONNECT_URI)
    // init DB
    await openStorageConnectionAsync()
    // init interval functions
    startIntervals()
    console.log('startup completed successfully')
  } catch (err) {
    console.error(`An error has occurred on startup: ${err}`)
    process.exit(1)
  }
}

// get the whole show started
start()
