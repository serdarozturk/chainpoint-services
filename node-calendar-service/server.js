const async = require('async')
const _ = require('lodash')
const MerkleTools = require('merkle-tools')
const amqp = require('amqplib/callback_api')
const uuidv1 = require('uuid/v1')

require('dotenv').config()

// The frequency to generate new calendar trees
const CALENDAR_INTERVAL_MS = process.env.CALENDAR_INTERVAL_MS || 1000

// How often should calendar trees be finalized
const FINALIZATION_INTERVAL_MS = process.env.FINALIZATION_INTERVAL_MS || 250

// How often blocks on calendar should be aggregated and anchored
const ANCHOR_AGG_INTERVAL_SECONDS = process.env.ANCHOR_AGG_INTERVAL_SECONDS || 600

// THE maximum number of messages sent over the channel that can be awaiting acknowledgement, 0 = no limit
const RMQ_PREFETCH_COUNT = process.env.RMQ_PREFETCH_COUNT || 0

// The queue name for message consumption originating from the aggregator service
const RMQ_WORK_IN_QUEUE = process.env.RMQ_WORK_IN_QUEUE || 'work.cal'

// The queue name for outgoing message to the proof state service
const RMQ_WORK_OUT_STATE_QUEUE = process.env.RMQ_WORK_OUT_STATE_QUEUE || 'work.state'

// The queue name for outgoing message to the btc tx service
const RMQ_WORK_OUT_BTCTX_QUEUE = process.env.RMQ_WORK_OUT_BTCTX_QUEUE || 'work.btctx'

// Connection string w/ credentials for RabbitMQ
const RABBITMQ_CONNECT_URI = process.env.RABBITMQ_CONNECT_URI || 'amqp://chainpoint:chainpoint@rabbitmq'

// TODO: Validate env variables and exit if values are out of bounds

// The merkle tools object for building trees and generating proof paths
const merkleTools = new MerkleTools()

// An array of all Merkle tree roots from aggregators needing
// to be processed. Will be filled as new roots arrive on the queue.
let AGGREGATION_ROOTS = []

// An array of all tree data ready to be finalized.
// Will be filled by the generateCalendar process as the
// merkle trees are built. Each object in this array
// contains the merkle root and the agg_id and proof
// paths for each leaf of the tree.
let TREES = []

// The channel used for all amqp communication
// This value is set once the connection has been established
let amqpChannel = null

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
        AGGREGATION_ROOTS = TREES = []
        setTimeout(amqpOpenConnection.bind(null, connectionString), 5 * 1000)
      })
      // create communication channel
      conn.createConfirmChannel((err, chan) => {
        if (err) return callback(err)
        // the connection and channel have been established
        // set 'amqpChannel' so that publishers have access to the channel
        console.log('Connection established')
        chan.assertQueue(RMQ_WORK_IN_QUEUE, { durable: true })
        chan.assertQueue(RMQ_WORK_OUT_STATE_QUEUE, { durable: true })
        chan.assertQueue(RMQ_WORK_OUT_BTCTX_QUEUE, { durable: true })
        chan.prefetch(RMQ_PREFETCH_COUNT)
        amqpChannel = chan

        chan.consume(RMQ_WORK_IN_QUEUE, (msg) => {
          processMessage(msg)
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

/**
* Parses a message and performs the required work for that message
*
* @param {amqp message object} msg - The AMQP message received from the queue
*/
function processMessage (msg) {
  if (msg !== null) {
    // determine the source of the message and handle appropriately
    switch (msg.properties.type) {
      case 'aggregator':
        consumeAggRootMessage(msg)
        break
      case 'btctx':
        // Consumes a tx  message from the btctx service
        consumeBtcTxMessage(msg)
        break
      default:
        // This is an unknown state type
        console.error('Unknown state type', msg.properties.type)
    }
  }
}

function consumeAggRootMessage (msg) {
  if (msg !== null) {
    let rootObj = JSON.parse(msg.content.toString())

    // add msg to the root object so that we can ack it during the finalize process for this root object
    rootObj.msg = msg
    AGGREGATION_ROOTS.push(rootObj)
  }
}

function consumeBtcTxMessage (msg) {
  if (msg !== null) {
    let btcTxObj = JSON.parse(msg.content.toString())

    async.series([
      (callback) => {
        // queue up message containing updated proof state bound for proof state service
        let stateObj = {}
        stateObj.anchor_agg_id = btcTxObj.anchor_agg_id
        stateObj.btctx_id = btcTxObj.btctx_id
        let anchorAggRoot = btcTxObj.anchor_agg_root
        let btctxBody = btcTxObj.btctx_body
        let prefix = btctxBody.substr(0, btctxBody.indexOf(anchorAggRoot))
        let suffix = btctxBody.substr(btctxBody.indexOf(anchorAggRoot) + anchorAggRoot.length)
        stateObj.btctx_state = {}
        stateObj.btctx_state.ops = [
          { l: prefix },
          { r: suffix }
        ]

        amqpChannel.sendToQueue(RMQ_WORK_OUT_STATE_QUEUE, Buffer.from(JSON.stringify(stateObj)), { persistent: true, type: 'btctx' },
          (err, ok) => {
            if (err !== null) {
              // An error as occurred publishing a message
              console.error(RMQ_WORK_OUT_STATE_QUEUE, '[btctx] publish message nacked')
              return callback(err)
            } else {
              // New message has been published
              console.log(RMQ_WORK_OUT_STATE_QUEUE, '[btctx] publish message acked')
              return callback(null)
            }
          })
      },
      // TODO: inform btc-mon of new tx_id to watch, queue up message bound for btc mon
      (callback) => {
        return callback(null)
      }
    ], (err, results) => {
      if (err) {
        amqpChannel.nack(msg)
        console.error(RMQ_WORK_IN_QUEUE, '[btctx] consume message nacked')
      } else {
        amqpChannel.ack(msg)
        console.log(RMQ_WORK_IN_QUEUE, '[btctx] consume message acked')
      }
    })
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

// AMQP initialization
amqpOpenConnection(RABBITMQ_CONNECT_URI)

// Take work off of the AGGREGATION_ROOTS array and build Merkle tree
let generateCalendarBlock = () => {
  let rootsForTree = AGGREGATION_ROOTS.splice(0)

  // create merkle tree only if there is at least one root to process
  if (rootsForTree.length > 0) {
    // clear the merkleTools instance to prepare for a new tree
    merkleTools.resetTree()

    // get root values from root objects
    let leaves = rootsForTree.map((rootObj) => {
      return rootObj.agg_root
    })

    // Add every root in rootsForTree to new Merkle tree
    merkleTools.addLeaves(leaves)
    merkleTools.makeTree()

    // Collect and store the calendar id, Merkle root, and proofs in an array where finalize() can find it
    let treeData = {}
    treeData.cal_id = uuidv1()
    treeData.cal_root = merkleTools.getMerkleRoot().toString('hex')

    let treeSize = merkleTools.getLeafCount()
    let proofData = []
    for (let x = 0; x < treeSize; x++) {
      // push the agg_id and corresponding proof onto the array
      let proofDataItem = {}
      proofDataItem.agg_id = rootsForTree[x].agg_id
      proofDataItem.agg_root = rootsForTree[x].agg_root
      proofDataItem.agg_msg = rootsForTree[x].msg
      proofDataItem.agg_hash_count = rootsForTree[x].agg_hash_count
      let proof = merkleTools.getProof(x)
      proofDataItem.proof = formatAsChainpointV3Ops(proof, 'sha-256')
      proofData.push(proofDataItem)
    }
    treeData.proofData = proofData

    TREES.push(treeData)
    console.log('rootsForTree length : %s', rootsForTree.length)
  }
}

// Temp/incomplete finalize function for writing to proof state service only, no calendar functions yet
let finalize = () => {
  // if the amqp channel is null (closed), processing should not continue, defer to next finalize call
  if (amqpChannel === null) return

  // process each set of tree data
  let treesToFinalize = TREES.splice(0)
  _.forEach(treesToFinalize, (treeDataObj) => {
    console.log('Processing tree', treesToFinalize.indexOf(treeDataObj) + 1, 'of', treesToFinalize.length)

    // TODO store Merkle root of calendar in DB and chain to previous calendar entries
    console.log('calendar write')

    // queue proof state messages for each aggregation root in the tree
    async.series([
      (callback) => {
        // for each aggregation root, queue up message containing updated proof state bound for proof state service
        async.each(treeDataObj.proofData, (proofDataItem, eachCallback) => {
          let stateObj = {}
          stateObj.agg_id = proofDataItem.agg_id
          stateObj.agg_root = proofDataItem.agg_root
          stateObj.agg_hash_count = proofDataItem.agg_hash_count
          stateObj.cal_id = treeDataObj.cal_id
          stateObj.cal_root = treeDataObj.cal_root
          stateObj.cal_state = {}
          // TODO: add ops extending proof path beyond cal_root to calendar block's block_hash
          stateObj.cal_state.ops = proofDataItem.proof

          // TODO update this temp anchor data when we start generating real values
          stateObj.cal_state.anchor = {
            anchor_id: '1027',
            uris: [
              'http://a.cal.chainpoint.org/1027/root',
              'http://b.cal.chainpoint.org/1027/root'
            ]
          }

          amqpChannel.sendToQueue(RMQ_WORK_OUT_STATE_QUEUE, Buffer.from(JSON.stringify(stateObj)), { persistent: true, type: 'cal' },
            (err, ok) => {
              if (err !== null) {
                // An error as occurred publishing a message
                console.error(RMQ_WORK_OUT_STATE_QUEUE, '[cal] publish message nacked')
                return eachCallback(err)
              } else {
                // New message has been published
                console.log(RMQ_WORK_OUT_STATE_QUEUE, '[cal] publish message acked')
                return eachCallback(null)
              }
            })
        }, (err) => {
          if (err) {
            console.error('Processing of tree', treesToFinalize.indexOf(treeDataObj) + 1, 'had errors.')
            return callback(err)
          } else {
            console.log('Processing of tree', treesToFinalize.indexOf(treeDataObj) + 1, 'complete')
            // pass all the agg_msg objects to the series() callback
            let messages = treeDataObj.proofData.map((proofDataItem) => {
              return proofDataItem.agg_msg
            })
            return callback(null, messages)
          }
        })
      }
    ], (err, results) => {
      // results[0] contains an array of agg_msg objects from the first function in this series
      if (err) {
        _.forEach(results[0], (message) => {
          // nack consumption of all original hash messages part of this aggregation event
          if (message !== null) {
            amqpChannel.nack(message)
            console.error(RMQ_WORK_IN_QUEUE, '[aggregator] consume message nacked')
          }
        })
      } else {
        _.forEach(results[0], (message) => {
          if (message !== null) {
            // ack consumption of all original hash messages part of this aggregation event
            amqpChannel.ack(message)
            console.log(RMQ_WORK_IN_QUEUE, '[aggregator] consume message acked')
          }
        })
      }
    })
  })
}

// Aggregate all block hashes on chain since last anchor block, add new anchor block to calendar, add new proof state entries, anchor root
let aggregateAndAnchor = () => {
  // TODO: Retrieve calendar blocks since last anchor block (inclusive?, lock db?)
  // TODO: Remove this below / faking it until we're making it / field count/names not entirely accurate
  let blocks = [
    { cal_id: uuidv1(), type: 'btc_anchor', block_hash: '18ee24150dcb1d96752a4d6dd0f20dfd8ba8c38527e40aa8509b7adecf78f9c6' },
    { cal_id: uuidv1(), type: 'cal_record', block_hash: '1bf4f3dabb60e9b25f9b4fb7b7a4a4ef184c3179e44877e8b9168572fc2001e8' },
    { cal_id: uuidv1(), type: 'cal_record', block_hash: '5dff3544e177054cc9b9009db4dc9f6ea0f91c69fc36e5f4323c3d78796decbb' },
    { cal_id: uuidv1(), type: 'cal_record', block_hash: 'b2d0f0e6a67b7a7c75db24137775b31ad542d2cc1f1b1d6ec991ee221ac4b66a' }
  ]

  // Build merkle tree with block hashes
  let leaves = blocks.map((blockObj) => {
    return blockObj.block_hash
  })

  // clear the merkleTools instance to prepare for a new tree
  merkleTools.resetTree()

  // Add every blockHash in blocks to new Merkle tree
  merkleTools.addLeaves(leaves)
  merkleTools.makeTree()

  // get the total count of leaves in this aggregation
  let treeSize = merkleTools.getLeafCount()

  let treeData = {}
  treeData.anchor_agg_id = uuidv1()
  treeData.anchor_agg_root = merkleTools.getMerkleRoot().toString('hex')

  let proofData = []
  for (let x = 0; x < treeSize; x++) {
    // for calendar records only, push the cal_id and corresponding proof onto the array
    if (blocks[x].type === 'cal_record') {
      let proofDataItem = {}
      proofDataItem.cal_id = blocks[x].cal_id
      proofDataItem.cal_block_hash = blocks[x].block_hash
      let proof = merkleTools.getProof(x)
      proofDataItem.proof = formatAsChainpointV3Ops(proof, 'sha-256')
      proofData.push(proofDataItem)
    }
  }
  treeData.proofData = proofData

  console.log('blocks length : %s', blocks.length)

  // TODO: Create/store new anchor block with resulting tree root (release lock?)

  // For each calendar record block in the tree, add proof state item containing proof ops from block_hash to anchor_agg_root
  async.series([
    (callback) => {
      // for each calendar block hash, queue up message containing updated proof state bound for proof state service
      async.each(treeData.proofData, (proofDataItem, eachCallback) => {
        let stateObj = {}
        stateObj.cal_id = proofDataItem.cal_id
        stateObj.cal_block_hash = proofDataItem.cal_block_hash
        stateObj.anchor_agg_id = treeData.anchor_agg_id
        stateObj.anchor_agg_root = treeData.anchor_agg_root
        stateObj.anchor_agg_state = {}
        stateObj.anchor_agg_state.ops = proofDataItem.proof

        // TODO update this temp anchor data when we start generating real values
        stateObj.anchor_agg_state.anchor = {
          anchor_id: '1027',
          uris: [
            'http://a.cal.chainpoint.org/1027/root',
            'http://b.cal.chainpoint.org/1027/root'
          ]
        }

        amqpChannel.sendToQueue(RMQ_WORK_OUT_STATE_QUEUE, Buffer.from(JSON.stringify(stateObj)), { persistent: true, type: 'anchor_agg' },
          (err, ok) => {
            if (err !== null) {
              // An error as occurred publishing a message
              console.error(RMQ_WORK_OUT_STATE_QUEUE, '[anchor_agg] publish message nacked')
              return eachCallback(err)
            } else {
              // New message has been published
              console.log(RMQ_WORK_OUT_STATE_QUEUE, '[anchor_agg] publish message acked')
              return eachCallback(null)
            }
          })
      }, (err) => {
        if (err) {
          console.error('Anchor aggregation had errors.')
          return callback(err)
        } else {
          console.log('Anchor aggregation complete')
          return callback(null)
        }
      })
    },
    (callback) => {
      // Create anchor_agg message data object for anchoring service(s)
      let anchorData = {
        anchor_agg_id: treeData.anchor_agg_id,
        anchor_agg_root: treeData.anchor_agg_root
      }

      // Send anchorData to the btc tx service
      amqpChannel.sendToQueue(RMQ_WORK_OUT_BTCTX_QUEUE, Buffer.from(JSON.stringify(anchorData)), { persistent: true },
        (err, ok) => {
          if (err !== null) {
            console.error(RMQ_WORK_OUT_BTCTX_QUEUE, 'publish message nacked')
          } else {
            console.log(RMQ_WORK_OUT_BTCTX_QUEUE, 'publish message acked')
          }
        })
    }
  ], (err) => {
    if (err) {
      console.error(err)
    } else {
      console.error('aggregateAndAnchor process complete.')
    }
  })
}

setInterval(() => generateCalendarBlock(), CALENDAR_INTERVAL_MS)

setInterval(() => finalize(), FINALIZATION_INTERVAL_MS)

setInterval(() => aggregateAndAnchor(), ANCHOR_AGG_INTERVAL_SECONDS * 1000)
