const _ = require('lodash')
const MerkleTools = require('merkle-tools')
const amqp = require('amqplib')
const crypto = require('crypto')
const async = require('async')

require('dotenv').config()

// An array of all hashes needing to be processed.
// Will be filled as new hashes arrive on the queue.
let HASHES = []

// An array of all tree data ready to be finalized.
// Will be filled by the aggregation process as the
// merkle trees are built. Each object in this array
// contains the merkle root and the hash_id and proof
// paths for each leaf of the tree.
let TREES = []

// The merkle tools object for building trees and generating proof paths
const merkleTools = new MerkleTools()

// The channel used for all amqp communication
// This value is set once the connection has been established
var amqpChannel = null

// Using DotEnv : https://github.com/motdotla/dotenv
// Expects AGGREGATION_INTERVAL environment variable
// Defaults to 1000ms if not present. Can set vars in
// `.env` file (do NOT commit to repo) or on command
// line:
//   AGGREGATION_INTERVAL=200 node server.js
//
const AGGREGATION_INTERVAL = process.env.AGGREGATION_INTERVAL || 1000

// How often should aggregated hashes be finalized by writing
// the Merkle tree root and all proofs to Proof service?
const FINALIZATION_INTERVAL = process.env.FINALIZE_INTERVAL || 250

// How many hashes to process as nodes on a new Merkle tree
// during each AGGREGATION_INTERVAL.
const HASHES_PER_MERKLE_TREE = process.env.HASHES_PER_MERKLE_TREE || 25000

// The name of the RabbitMQ topic exchange to use
const RMQ_WORK_EXCHANGE_NAME = process.env.RMQ_WORK_EXCHANGE_NAME || 'work_topic_exchange'

// The topic exchange routing key for message consumption originating from proof state service
const RMQ_WORK_IN_ROUTING_KEY = process.env.RMQ_WORK_IN_ROUTING_KEY || 'work.agg_0'

// The topic exchange routing key for message publishing bound for the proof state service
const RMQ_WORK_OUT_ROUTING_KEY = process.env.RMQ_WORK_OUT_ROUTING_KEY || 'work.agg_0.state'

// Connection string w/ credentials for RabbitMQ
const RABBITMQ_CONNECT_URI = process.env.RABBITMQ_CONNECT_URI || 'amqp://chainpoint:chainpoint@rabbitmq'

// Validate env variables and exit if values are out of bounds
var envErrors = []
if (!_.inRange(AGGREGATION_INTERVAL, 250, 10001)) envErrors.push('Bad AGGREGATION_INTERVAL')
if (!_.inRange(FINALIZATION_INTERVAL, 250, 10001)) envErrors.push('Bad FINALIZATION_INTERVAL')
if (!_.inRange(HASHES_PER_MERKLE_TREE, 100, 25001)) envErrors.push('Bad HASHES_PER_MERKLE_TREE')
if (envErrors.length > 0) throw new Error(envErrors)

/**
 * Opens an AMPQ connection and channel
 * Retry logic is included to handle losses of connection
 *
 * @param {string} connectionString - The connection string for the RabbitMQ instance, an AMQP URI
 */
function amqpOpenConnection (connectionString) {
  amqp.connect(connectionString).then(function (conn) {
    conn.on('close', () => {
      // if the channel closes for any reason, attempt to reconnect
      console.error('Connection to RMQ closed.  Reconnecting in 5 seconds...')
      // channel is lost, reset to null
      amqpChannel = null
      // un-acked messaged will be requeued, so clear all work in progress
      HASHES = TREES = []
      setTimeout(amqpOpenConnection.bind(null, connectionString), 5 * 1000)
    })
    conn.createConfirmChannel().then(function (chan) {
      // the connection and channel have been established
      // set 'amqpChannel' so that publishers have access to the channel
      console.log('Connection established')
      chan.assertExchange(RMQ_WORK_EXCHANGE_NAME, 'topic', { durable: true })
      amqpChannel = chan

      // Continuously load the HASHES from RMQ with hash objects to process
      return amqpChannel.assertQueue('', { durable: true }).then(function (q) {
        amqpChannel.bindQueue(q.queue, RMQ_WORK_EXCHANGE_NAME, RMQ_WORK_IN_ROUTING_KEY)
        return amqpChannel.consume(q.queue, function (msg) {
          if (msg !== null) {
            let hashObj = JSON.parse(msg.content.toString())
            console.log(hashObj)

            // add msg to the hash object so that we can ack it during the finalize process for this hash
            hashObj.msg = msg
            HASHES.push(hashObj)
          }
        })
      })
    })
  }).catch(() => {
    // catch errors when attempting to establish connection
    console.error('Cannot establish connection. Attempting in 5 seconds...')
    setTimeout(amqpOpenConnection.bind(null, connectionString), 5 * 1000)
  })
}

// AMQP initialization
amqpOpenConnection(RABBITMQ_CONNECT_URI)

// Take work off of the HASHES array and build Merkle tree
let aggregate = function () {
  // if the amqp channel is null (closed), processing should not continue, defer to next aggregate call
  if (amqpChannel === null) return

  let hashesForTree = HASHES.splice(0, HASHES_PER_MERKLE_TREE)

  // create merkle tree only if there is at least one hash to process
  if (hashesForTree.length > 0) {
    // clear the merkleTools instance to prepare for a new tree
    merkleTools.resetTree()

    // concatonate and hash the hash ids and hash values into new array
    let leaves = hashesForTree.map(hashObj => {
      let hashIdBuffer = Buffer.from(hashObj.hash_id, 'utf8')
      let hashBuffer = Buffer.from(hashObj.hash, 'hex')
      return crypto.createHash('sha256').update(Buffer.concat([hashIdBuffer, hashBuffer])).digest('hex')
    })

    // Add every hash in hashesForTree to new Merkle tree
    merkleTools.addLeaves(leaves)
    merkleTools.makeTree()

    // Collect and store the aggregation id, Merkle root, and proofs in an array where finalize() can find it
    let treeData = {}
    treeData.root = merkleTools.getMerkleRoot().toString('hex')

    let treeSize = merkleTools.getLeafCount()
    let proofData = []
    for (let x = 0; x < treeSize; x++) {
      // push the hash_id and corresponding proof onto the array, inserting the UUID concat/hash step at the beginning
      let proofDataItem = {}
      proofDataItem.hash_id = hashesForTree[x].hash_id
      proofDataItem.hash_msg = hashesForTree[x].msg
      proofDataItem.proof = merkleTools.getProof(x).unshift({ left: hashesForTree[x].hash_id })
      proofData.push(proofDataItem)
    }
    treeData.proofData = proofData

    TREES.push(treeData)
    console.log('hashesForTree length : %s', hashesForTree.length)
  }
}

// Finalize already aggregated hash proofs by queuing message bound for proof state service
// and acking the original hash object message for all messages in all trees ready for finalization
let finalize = function () {
  // if the amqp channel is null (closed), processing should not continue, defer to next finalize call
  if (amqpChannel === null) return

  // process each set of tree data
  let treesToFinalize = TREES.splice(0)
  _.forEach(treesToFinalize, function (treeDataObj) {
    console.log('Processing tree', treesToFinalize.indexOf(treeDataObj) + 1, 'of', treesToFinalize.length)

    // for each hash , queue up message containing updated proof state bound for proof state service
    async.each(treeDataObj.proofData, function (proofDataItem, callback) {
      let stateObj = {}
      stateObj.hash_id = proofDataItem.hash_id
      stateObj.state = {}
      stateObj.state.ops = proofDataItem.proof
      stateObj.value = treeDataObj.root

      amqpChannel.publish(RMQ_WORK_EXCHANGE_NAME, RMQ_WORK_OUT_ROUTING_KEY, new Buffer(JSON.stringify(stateObj)), { persistent: true },
        function (err, ok) {
          if (err !== null) {
            // An error as occurred publishing a message, nack consumption of message
            console.error(RMQ_WORK_OUT_ROUTING_KEY, 'publish message nacked')
            amqpChannel.nack(proofDataItem.hash_msg)
            console.error(RMQ_WORK_IN_ROUTING_KEY, 'consume message nacked')
            return callback(null)
          } else {
            // New message has been published, ack consumption of original message
            console.log(RMQ_WORK_OUT_ROUTING_KEY, 'publish message acked')
            amqpChannel.ack(proofDataItem.hash_msg)
            console.log(RMQ_WORK_IN_ROUTING_KEY, 'consume message acked')
            return callback(null)
          }
        })
    }, function (err) {
      if (err) {
        console.error('Processing of tree', treesToFinalize.indexOf(treeDataObj) + 1, 'had errors.')
      } else {
        console.log('Processing of tree', treesToFinalize.indexOf(treeDataObj) + 1, 'complete')
      }
    })
  })
}

setInterval(() => finalize(), FINALIZATION_INTERVAL)

setInterval(() => aggregate(), AGGREGATION_INTERVAL)
