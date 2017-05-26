const _ = require('lodash')
const MerkleTools = require('merkle-tools')
const amqp = require('amqplib/callback_api')
const crypto = require('crypto')
const async = require('async')
const uuidv1 = require('uuid/v1')

require('dotenv').config()

const REDIS_CONNECT_URI = process.env.REDIS_CONNECT_URI || 'redis://redis:6379'
const r = require('redis')
const redis = r.createClient(REDIS_CONNECT_URI)

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

// THE maximum number of messages sent over the channel that can be awaiting acknowledgement, 0 = no limit
const RMQ_PREFETCH_COUNT = process.env.RMQ_PREFETCH_COUNT || 0

// The queue name for message consumption originating from the splitter service
const RMQ_WORK_IN_QUEUE = process.env.RMQ_WORK_IN_QUEUE || 'work.agg'

// The queue name for outgoing message to the calendar service
const RMQ_WORK_OUT_CAL_QUEUE = process.env.RMQ_WORK_OUT_CAL_QUEUE || 'work.cal'

// The queue name for outgoing message to the proof state service
const RMQ_WORK_OUT_STATE_QUEUE = process.env.RMQ_WORK_OUT_STATE_QUEUE || 'work.state'

// Connection string w/ credentials for RabbitMQ
const RABBITMQ_CONNECT_URI = process.env.RABBITMQ_CONNECT_URI || 'amqp://chainpoint:chainpoint@rabbitmq'

const NIST_KEY_LAST = process.env.NIST_KEY_BASE || 'nist:last'

// The local variable holding the NIST Beacon data, from Redis in NIST_KEY_LAST, refreshed every minute
let nistLastData = null

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
        HASHES = TREES = []
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
        chan.assertQueue(RMQ_WORK_OUT_STATE_QUEUE, { durable: true })
        chan.prefetch(RMQ_PREFETCH_COUNT)
        amqpChannel = chan
        // Continuously load the HASHES from RMQ with hash objects to process)
        chan.consume(RMQ_WORK_IN_QUEUE, (msg) => {
          consumeHashMessage(msg)
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

const refreshNistData = (callback) => {
  redis.get(NIST_KEY_LAST, (err, res) => {
    if (err) return callback(err)
    // save received nistData object
    nistLastData = JSON.parse(res)
    if (!nistLastData) return callback('NIST data is null')
    return callback(null)
  })
}

function consumeHashMessage (msg) {
  if (msg !== null) {
    let hashObj = JSON.parse(msg.content.toString())

    // add msg to the hash object so that we can ack it during the finalize process for this hash
    hashObj.msg = msg
    HASHES.push(hashObj)
  }
}

/**
 * Converts proof path array output from the merkle-tools package
 * to a Chainpoint v3 ops array
 *
 * @param {proof object array} proof - The proof array generated by merkle-tools
 * @param {string} op - The hash type performed throughout merkle tree construction (sha-256, sha-512, sha-256-x2, etc.)
 * @returns {ops object array}
 */
function formatAsChainpointV3Ops (proof, op) {
  proof = proof.map((item) => {
    if (item.left) {
      return { l: item.left }
    } else {
      return { r: item.right }
    }
  })
  let ChainpointV3Ops = []
  for (let x = 0; x < proof.length; x++) {
    ChainpointV3Ops.push(proof[x])
    ChainpointV3Ops.push({ op: op })
  }
  return ChainpointV3Ops
}

/**
 * Initializes NistData
 **/
function initializeNistData (callback) {
  // refresh on script startup, and periodically afterwards
  refreshNistData((err) => {
    if (err) {
      setTimeout(initializeNistData.bind(null, callback), 5 * 1000)
      return callback('Cannot initialize NistData. Attempting in 5 seconds...')
    } else {
      // NistData initialized, now refresh every 60 seconds
      console.log('NistData initialized')
      setInterval(() => refreshNistData((err) => { if (err) console.error(err) }), 1000 * 60)
      return callback(null, true)
    }
  })
}

// Initializes nistData and then amqp connection
initializeNistData((err, result) => {
  if (err) {
    console.error(err)
  } else {
    // AMQP initialization
    amqpOpenConnection(RABBITMQ_CONNECT_URI)
  }
})

// Take work off of the HASHES array and build Merkle tree
let aggregate = () => {
  let hashesForTree = HASHES.splice(0, HASHES_PER_MERKLE_TREE)

  let nistDataString = (nistLastData.timeStamp + ':' + nistLastData.seedValue).toLowerCase()
  let nistDataBuffer = Buffer.from(nistDataString, 'utf8')

  // create merkle tree only if there is at least one hash to process
  if (hashesForTree.length > 0) {
    // clear the merkleTools instance to prepare for a new tree
    merkleTools.resetTree()

    // concatenate and hash the hash ids and hash values into new array
    let leaves = hashesForTree.map((hashObj) => {
      let hashIdBuffer = Buffer.from(hashObj.hash_id, 'utf8')
      let hashBuffer = Buffer.from(hashObj.hash, 'hex')
      let concatAndHashBuffer = crypto.createHash('sha256').update(Buffer.concat([hashIdBuffer, hashBuffer])).digest()
      return crypto.createHash('sha256').update(Buffer.concat([nistDataBuffer, concatAndHashBuffer])).digest('hex')
    })

    // Add every hash in hashesForTree to new Merkle tree
    merkleTools.addLeaves(leaves)
    merkleTools.makeTree()

    let treeSize = merkleTools.getLeafCount()

    // Collect and store the aggregation id, Merkle root, and proofs in an array where finalize() can find it
    let treeData = {}
    treeData.agg_id = uuidv1()
    treeData.agg_root = merkleTools.getMerkleRoot().toString('hex')
    treeData.agg_hash_count = treeSize

    let proofData = []
    for (let x = 0; x < treeSize; x++) {
      // push the hash_id and corresponding proof onto the array, inserting the UUID concat/hash step at the beginning
      let proofDataItem = {}
      proofDataItem.hash_id = hashesForTree[x].hash_id
      proofDataItem.hash = hashesForTree[x].hash
      proofDataItem.hash_msg = hashesForTree[x].msg
      let proof = merkleTools.getProof(x)
      proof.unshift({ left: nistDataString })
      proof.unshift({ left: hashesForTree[x].hash_id })
      proofDataItem.proof = formatAsChainpointV3Ops(proof, 'sha-256')
      proofData.push(proofDataItem)
    }
    treeData.proofData = proofData

    TREES.push(treeData)
    console.log('hashesForTree length : %s', hashesForTree.length)
  }
}

// Finalize already aggregated hash proofs by queuing state messages bound for proof state service,
// queuing aggregation event message bound for the calendar service, and acking the original
// hash object message for all messages in all trees ready for finalization
let finalize = () => {
  // if the amqp channel is null (closed), processing should not continue, defer to next finalize call
  if (amqpChannel === null) return

  // process each set of tree data
  let treesToFinalize = TREES.splice(0)
  _.forEach(treesToFinalize, (treeDataObj) => {
    console.log('Processing tree', treesToFinalize.indexOf(treeDataObj) + 1, 'of', treesToFinalize.length)

    // queue state messages, and when complete, queue message for calendar service to continue processing
    async.series([
      (callback) => {
        // for each hash, queue up message containing updated proof state bound for proof state service
        async.each(treeDataObj.proofData, (proofDataItem, eachCallback) => {
          let stateObj = {}
          stateObj.hash_id = proofDataItem.hash_id
          stateObj.hash = proofDataItem.hash
          stateObj.agg_id = treeDataObj.agg_id
          stateObj.agg_state = {}
          stateObj.agg_state.ops = proofDataItem.proof

          amqpChannel.sendToQueue(RMQ_WORK_OUT_STATE_QUEUE, Buffer.from(JSON.stringify(stateObj)), { persistent: true, type: 'aggregator' },
            (err, ok) => {
              if (err !== null) {
                // An error as occurred publishing a message
                console.error(RMQ_WORK_OUT_STATE_QUEUE, '[aggregator] publish message nacked')
                return eachCallback(err)
              } else {
                // New message has been published
                console.log(RMQ_WORK_OUT_STATE_QUEUE, '[aggregator] publish message acked')
                return eachCallback(null)
              }
            })
        }, (err) => {
          if (err) {
            console.error('Processing of tree', treesToFinalize.indexOf(treeDataObj) + 1, 'had errors.')
            return callback(err)
          } else {
            console.log('Processing of tree', treesToFinalize.indexOf(treeDataObj) + 1, 'complete')
            // pass all the hash_msg objects to the series() callback
            let messages = treeDataObj.proofData.map((proofDataItem) => {
              return proofDataItem.hash_msg
            })
            return callback(null, messages)
          }
        })
      },
      (callback) => {
        let aggObj = {}
        aggObj.agg_id = treeDataObj.agg_id
        aggObj.agg_root = treeDataObj.agg_root
        aggObj.agg_hash_count = treeDataObj.agg_hash_count

        amqpChannel.sendToQueue(RMQ_WORK_OUT_CAL_QUEUE, Buffer.from(JSON.stringify(aggObj)), { persistent: true, type: 'aggregator' },
          (err, ok) => {
            if (err !== null) {
              // An error as occurred publishing a message
              console.error(RMQ_WORK_OUT_CAL_QUEUE, 'publish message nacked')
              return callback(err)
            } else {
              // New message has been published
              console.log(RMQ_WORK_OUT_CAL_QUEUE, 'publish message acked')
              return callback(null)
            }
          })
      }
    ], (err, results) => {
      // results[0] contains an array of hash_msg objects from the first function in this series
      if (err) {
        _.forEach(results[0], (message) => {
          // nack consumption of all original hash messages part of this aggregation event
          if (message !== null) {
            amqpChannel.nack(message)
            console.error(RMQ_WORK_IN_QUEUE, 'consume message nacked')
          }
        })
      } else {
        _.forEach(results[0], (message) => {
          if (message !== null) {
            // ack consumption of all original hash messages part of this aggregation event
            amqpChannel.ack(message)
            console.log(RMQ_WORK_IN_QUEUE, 'consume message acked')
          }
        })
      }
    })
  })
}

setInterval(() => finalize(), FINALIZATION_INTERVAL)

setInterval(() => aggregate(), AGGREGATION_INTERVAL)

// export these functions for unit tests
module.exports = {
  getHASHES: function () { return HASHES },
  setHASHES: function (hashes) { HASHES = hashes },
  getTREES: function () { return TREES },
  setTREES: function (trees) { TREES = trees },
  getAMQPChannel: function () { return amqpChannel },
  setAMQPChannel: (chan) => { amqpChannel = chan },
  amqpOpenConnection: amqpOpenConnection,
  consumeHashMessage: consumeHashMessage,
  aggregate: aggregate,
  finalize: finalize
}
