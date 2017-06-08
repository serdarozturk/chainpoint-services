const MerkleTools = require('merkle-tools')
const amqp = require('amqplib/callback_api')
const async = require('async')
const request = require('request')
const _ = require('lodash')

require('dotenv').config()

// An array of all Bitcoin transaction id objects needing to be monitored.
// Will be filled as new trasnactions ids arrive on the queue.
let BTCTXIDS = []

// The merkle tools object for building trees and generating proof paths
const merkleTools = new MerkleTools()

// The channel used for all amqp communication
// This value is set once the connection has been established
var amqpChannel = null

// Using DotEnv : https://github.com/motdotla/dotenv
// Expects MONITOR_INTERVAL environment variable
// Defaults to 30 seconds if not present. Can set vars in
// `.env` file (do NOT commit to repo) or on command
// line:
//   MONITOR_INTERVAL=200 node server.js
//
const MONITOR_INTERVAL_SECONDS = process.env.MONITOR_INTERVAL_SECONDS || 30

// The number of confirmations needed before the transaction is considered ready for proof delivery
const MIN_BTC_CONFIRMS = process.env.MIN_BTC_CONFIRMS || 6

// The maximum number of messages sent over the channel that can be awaiting acknowledgement, 0 = no limit
const RMQ_PREFETCH_COUNT = process.env.RMQ_PREFETCH_COUNT || 0

// The queue name for message consumption originating from the calendar service
const RMQ_WORK_IN_QUEUE = process.env.RMQ_WORK_IN_QUEUE || 'work.btcmon'

// The queue name for outgoing message to the calendar service
const RMQ_WORK_OUT_CAL_QUEUE = process.env.RMQ_WORK_OUT_CAL_QUEUE || 'work.cal'

// Connection string w/ credentials for RabbitMQ
const RABBITMQ_CONNECT_URI = process.env.RABBITMQ_CONNECT_URI || 'amqp://chainpoint:chainpoint@rabbitmq'

// BCOIN REST API
// These values are private and are accessed from environment variables only
const BCOIN_API_BASE_URI = process.env.BCOIN_API_BASE_URI
const BCOIN_API_USERNAME = process.env.BCOIN_API_USERNAME
const BCOIN_API_PASS = process.env.BCOIN_API_PASS

// Validate env variables and exit if values are out of bounds
var envErrors = []
if (!_.inRange(MONITOR_INTERVAL_SECONDS, 10, 601)) envErrors.push('Bad MONITOR_INTERVAL_SECONDS')
if (!_.inRange(MIN_BTC_CONFIRMS, 1, 16)) envErrors.push('Bad MONITOR_INTERVAL_SECONDS')
if (envErrors.length > 0) throw new Error(envErrors)

/**
 * Opens an AMPQ connection and channel
 * Retry logic is included to handle losses of connection
 *
 * @param {string} connectionString - The connection string for the RabbitMQ instance, an AMQP URI
 */
function amqpOpenConnection (connectionString) {
  async.waterfall([
    (callback) => {
      // connect to rabbitmq server
      amqp.connect(connectionString, (err, conn) => {
        if (err) return callback(err)
        return callback(null, conn)
      })
    },
    (conn, callback) => {
      // if the channel closes for any reason, attempt to reconnect
      conn.on('close', () => {
        console.error('Connection to RMQ closed.  Reconnecting in 5 seconds...')
        amqpChannel = null
        // un-acked messaged will be requeued, so clear all work in progress
        BTCTXIDS = []
        setTimeout(amqpOpenConnection.bind(null, connectionString), 5 * 1000)
      })
      // create communication channel
      conn.createConfirmChannel((err, chan) => {
        if (err) return callback(err)
        // the connection and channel have been established
        // set 'amqpChannel' so that publishers have access to the channel
        console.log('Connection established')
        chan.assertQueue(RMQ_WORK_IN_QUEUE, { durable: true })
        chan.assertQueue(RMQ_WORK_OUT_CAL_QUEUE, { durable: true })
        chan.prefetch(RMQ_PREFETCH_COUNT)
        amqpChannel = chan
        // Continuously load the HASHES from RMQ with hash objects to process)
        chan.consume(RMQ_WORK_IN_QUEUE, (msg) => {
          consumeBtcTxIdMessage(msg)
        })
        return callback(null)
      })
    }
  ], (err) => {
    if (err) {
      // catch errors when attempting to establish connection
      console.error('Cannot establish connection. Attempting in 5 seconds...')
      setTimeout(amqpOpenConnection.bind(null, connectionString), 5 * 1000)
    }
  })
}

function consumeBtcTxIdMessage (msg) {
  if (msg !== null) {
    let btcTxIdObj = JSON.parse(msg.content.toString())

    // add msg to the btc tx id object so that we can ack it once requisite confirmations
    // are achieved and monitoring for this tx id is completed
    btcTxIdObj.msg = msg
    BTCTXIDS.push(btcTxIdObj)
  }
}

/**
 * Send a GET request to /tx/:id with a :id parameter
 * containing the id of the transaction to retrieve
 *
 * @param {string} id - The bitcoin transaction id of the transaction to retrieve
 */
const getBTCTxById = (id, callback) => {
  let options = {
    headers: [
      {
        name: 'Content-Type',
        value: 'application/json'
      }
    ],
    method: 'GET',
    uri: BCOIN_API_BASE_URI + '/tx/' + id,
    json: true,
    gzip: true,
    auth: {
      user: BCOIN_API_USERNAME,
      pass: BCOIN_API_PASS
    }
  }
  request(options, function (err, response, body) {
    if (err || response.statusCode !== 200) {
      if (!err) err = `GET failed with status code ${response.statusCode}`
      return callback(err)
    }
    return callback(null, body)
  })
}

/**
 * Send a GET request to /
 *
 */
const getChainState = (callback) => {
  let options = {
    headers: [
      {
        name: 'Content-Type',
        value: 'application/json'
      }
    ],
    method: 'GET',
    uri: BCOIN_API_BASE_URI + '/',
    json: true,
    gzip: true,
    auth: {
      user: BCOIN_API_USERNAME,
      pass: BCOIN_API_PASS
    }
  }
  request(options, function (err, response, body) {
    if (err || response.statusCode !== 200) {
      if (!err) err = `GET failed with status code ${response.statusCode}`
      return callback(err)
    }
    return callback(null, body)
  })
}

/**
 * Send a GET request to /block/:block with a :block parameter
 * containing the block hash of the block for which we want to retrieve the transaction ids
 *
 * @param {string} blockHash - The blockHash of the bitcoin block
 */
const getBlockInfoForBlockHash = (blockHash, callback) => {
  let options = {
    headers: [
      {
        name: 'Content-Type',
        value: 'application/json'
      }
    ],
    method: 'POST',
    uri: BCOIN_API_BASE_URI + '/',
    body: {
      method: 'getblock',
      params: [blockHash]
    },
    json: true,
    gzip: true,
    auth: {
      user: BCOIN_API_USERNAME,
      pass: BCOIN_API_PASS
    }
  }
  request(options, function (err, response, body) {
    if (err || response.statusCode !== 200) {
      if (!err || !body.tx) err = `GET failed with status code ${response.statusCode}`
      return callback(err)
    }
    return callback(null, body)
  })
}

// AMQP initialization
amqpOpenConnection(RABBITMQ_CONNECT_URI)

// Iterate through all BTCTXIDS objects, checking the confirmation count for each transaction
// If MIN_BTC_CONFIRMS is reached for a given transaction, retrieve the state data needed
// to build the proof path from the transaction to the block header merkle root value and
// return that information to calendar service, ack message.
let monitorTransactions = () => {
  // if the amqp channel is null (closed), processing should not continue, defer to next monitorTransactions call
  if (amqpChannel === null) return

  // process each set of btctxid data
  let btcTxIdsToMonitor = BTCTXIDS.splice(0)
  console.log(`Btc Tx montoring process starting for ${btcTxIdsToMonitor.length} transaction(s)`)
  async.eachSeries(btcTxIdsToMonitor, (btcTxIdObj, eachCallback) => {
    console.log(`Checking btc tx id = ${btcTxIdObj.tx_id} started`)
    async.waterfall([
      (wfCallback) => {
        // get tx information
        getBTCTxById(btcTxIdObj.tx_id, (err, tx) => {
          if (err) return wfCallback(err)
          // if transaction is not part of a block yet, return transaction is not ready
          if (tx.height === -1) return wfCallback(btcTxIdObj.tx_id + ' not ready')
          // otherwise, pass along relevant transaction information
          let blockHash = tx.block
          let blockHeight = tx.height
          let txIndex = tx.index
          return wfCallback(null, blockHash, blockHeight, txIndex)
        })
      },
      (blockHash, blockHeight, txIndex, wfCallback) => {
        // get current chain state
        // TODO: Move this out any only call once at the start for the entire batch?
        getChainState((err, chainInfo) => {
          if (err) return wfCallback(err)
          let chainHeight = chainInfo.chain.height
          return wfCallback(null, blockHash, blockHeight, txIndex, chainHeight)
        })
      },
      (blockHash, blockHeight, txIndex, chainHeight, wfCallback) => {
        // calculate confirmations
        let confirmCount = chainHeight - blockHeight + 1
        // if confirmation count < MIN_BTC_CONFIRMS, this transaction is not ready
        if (confirmCount < MIN_BTC_CONFIRMS) return wfCallback(btcTxIdObj.tx_id + ' not ready')
        // retrieve btc block transactions ids and build state data object
        getBlockInfoForBlockHash(blockHash, (err, blockInfo) => {
          if (err) return wfCallback(err)
          let blockTxIds = blockInfo.result.tx
          let blockRoot = blockInfo.result.merkleroot
          return wfCallback(null, blockTxIds, txIndex, blockRoot, blockHeight)
        })
      },
      (blockTxIds, txIndex, blockRoot, blockHeight, wfCallback) => {
        // adjust for endieness, reverse txids for further processing
        for (let x = 0; x < blockTxIds.length; x++) {
          blockTxIds[x] = blockTxIds[x].match(/.{2}/g).reverse().join('')
        }
        // build BTC merkle tree with txIds
        merkleTools.resetTree()
        merkleTools.addLeaves(blockTxIds)
        merkleTools.makeBTCTree(true)
        let rootValueBuffer = merkleTools.getMerkleRoot()
        // re-adjust for endieness, reverse and convert back to hex
        let rootValueHex = rootValueBuffer.reverse().toString('hex')
        if (rootValueHex !== blockRoot) return wfCallback('calculated merkle root does not match block merkle root')
        // get proof path from tx to block root
        let proofPath = merkleTools.getProof(txIndex)
        // send data back to calendar
        let messageObj = {}
        messageObj.btctx_id = btcTxIdObj.tx_id
        messageObj.btchead_height = blockHeight
        messageObj.btchead_root = rootValueHex
        messageObj.path = proofPath
        amqpChannel.sendToQueue(RMQ_WORK_OUT_CAL_QUEUE, Buffer.from(JSON.stringify(messageObj)), { persistent: true, type: 'btcmon' },
          (err, ok) => {
            if (err !== null) {
              console.error(RMQ_WORK_OUT_CAL_QUEUE, '[btcmon] publish message nacked')
              return wfCallback(err)
            } else {
              console.log(RMQ_WORK_OUT_CAL_QUEUE, '[btcmon] publish message acked')
              return wfCallback(null)
            }
          })
      }
    ], (err) => {
      if (err) {
        console.error(err)
        // nack consumption of this message
        amqpChannel.nack(btcTxIdObj.msg)
        console.error(RMQ_WORK_IN_QUEUE, 'consume message nacked')
      } else {
        // if minimim confirms have been achieved and return message to calendar published, ack consumption of this message
        console.log(btcTxIdObj.tx_id + ' confirmed and processed')
        console.log(RMQ_WORK_IN_QUEUE, 'consume message acked')
      }
      return eachCallback(null)
    })
  }, (err) => {
    if (err) {
      // an error has occured, write to console
      console.error(err)
    } else {
      console.log(`Btc Tx montoring process complete`)
    }
  })
}

setInterval(() => monitorTransactions(), MONITOR_INTERVAL_SECONDS * 1000)

// export these functions for unit tests
module.exports = {
  getBTCTXIDS: function () { return BTCTXIDS },
  setBTCTXIDS: function (btctxids) { BTCTXIDS = btctxids },
  getAMQPChannel: function () { return amqpChannel },
  setAMQPChannel: (chan) => { amqpChannel = chan },
  amqpOpenConnection: amqpOpenConnection,
  consumeBtcTxIdMessage: consumeBtcTxIdMessage,
  monitorTransactions: monitorTransactions
}
