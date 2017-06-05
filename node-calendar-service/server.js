const async = require('async')
const _ = require('lodash')
const MerkleTools = require('merkle-tools')
const amqp = require('amqplib/callback_api')
const uuidv1 = require('uuid/v1')

require('dotenv').config()

const CONSUL_HOST = process.env.CONSUL_HOST || 'consul'
const CONSUL_PORT = process.env.CONSUL_PORT || 8500
const consul = require('consul')({ host: CONSUL_HOST, port: CONSUL_PORT })

// consul : uncomment to enable *very* detailed consul logging.
// consul.on('log', console.log)

// The consul key to hold for calendar blockchain DB locks
const CALENDAR_LOCK_KEY = process.env.CALENDAR_LOCK_KEY || 'service/calendar/blockchain/lock'

// Deterministic object hashing for signatures
// see: https://github.com/emschwartz/objecthash-js
// see: https://github.com/benlaurie/objecthash
const objectHash = require('objecthash')

// The frequency to generate new calendar trees : 1 every 10 seconds by default
const CALENDAR_INTERVAL_MS = process.env.CALENDAR_INTERVAL_MS || 10000

// The frequency to generate new NIST Random Beacon Blocks
const NIST_INTERVAL_MS = process.env.NIST_INTERVAL_MS || 60000

// How often should calendar trees be persisted
const TREE_PERSIST_INTERVAL_MS = process.env.TREE_PERSIST_INTERVAL_MS || 250

// How often blocks on calendar should be aggregated and anchored
const ANCHOR_ETH_INTERVAL_MS = process.env.ANCHOR_ETH_INTERVAL_MS || 60000 // 1 min
const ANCHOR_BTC_INTERVAL_MS = process.env.ANCHOR_BTC_INTERVAL_MS || 600000 // 10 min

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

// TweetNaCl.js
// see: http://ed25519.cr.yp.to
// see: https://github.com/dchest/tweetnacl-js#signatures
const nacl = require('tweetnacl')
nacl.util = require('tweetnacl-util')

// Instantiate signing keypair from a 32 byte random hex secret
// passed in via env var. The Base64 encoded random seed can be
// created with:
//   nacl.util.encodeBase64(nacl.randomBytes(32))
//
let naclKeypairSeed = null
if (process.env.NACL_KEYPAIR_SEED) {
  naclKeypairSeed = nacl.util.decodeBase64(process.env.NACL_KEYPAIR_SEED)
} else {
  console.error('Missing NACL_KEYPAIR_SEED environment variable')
  process.exit(1)
}

const signingKeypair = nacl.sign.keyPair.fromSeed(naclKeypairSeed)

const zeroStr = '0000000000000000000000000000000000000000000000000000000000000000'

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

// CockroachDB Sequelize ORM
let Sequelize = require('sequelize-cockroachdb')

const COCKROACH_HOST = process.env.COCKROACH_HOST || 'roach1'
const COCKROACH_PORT = process.env.COCKROACH_PORT || 26257
const COCKROACH_DB_NAME = process.env.COCKROACH_DB_NAME || 'chainpoint'
const COCKROACH_DB_USER = process.env.COCKROACH_DB_USER || 'chainpoint'
const COCKROACH_DB_PASS = process.env.COCKROACH_DB_PASS || ''
const COCKROACH_TABLE_NAME = process.env.COCKROACH_TABLE_NAME || 'chainpoint_calendar_blockchain'

// Connect to CockroachDB through Sequelize.
let sequelize = new Sequelize(COCKROACH_DB_NAME, COCKROACH_DB_USER, COCKROACH_DB_PASS, {
  dialect: 'postgres',
  host: COCKROACH_HOST,
  port: COCKROACH_PORT
})

// Define the model and the table it will be stored in.
// See : Why don't we auto increment primary key automatically:
//   https://www.cockroachlabs.com/docs/serial.html
var CalendarBlock = sequelize.define(COCKROACH_TABLE_NAME,
  {
    id: {
      comment: 'Sequential monotonically incrementing Integer ID representing block height.',
      primaryKey: true,
      type: Sequelize.INTEGER,
      validate: {
        isInt: true
      },
      allowNull: false,
      unique: true
    },
    time: {
      comment: 'Block creation time in milliseconds since unix epoch',
      type: Sequelize.INTEGER,
      validate: {
        isInt: true
      },
      allowNull: false,
      unique: true
    },
    version: {
      comment: 'Block version number, for future use.',
      type: Sequelize.INTEGER,
      defaultValue: function () {
        return 1
      },
      validate: {
        isInt: true
      },
      allowNull: false
    },
    type: {
      comment: 'Block type.',
      type: Sequelize.STRING,
      validate: {
        isIn: [['cal', 'nist', 'btc-a', 'btc-c', 'eth-a', 'eth-c']]
      },
      allowNull: false
    },
    data: {
      comment: 'The data to be anchored to this block, data value meaning is determined by block type.',
      type: Sequelize.STRING,
      validate: {
        is: ['^[a-f0-9]{1,255}$', 'i']
      },
      allowNull: false,
      unique: true
    },
    prevHash: {
      comment: 'Block hash of previous block ID',
      type: Sequelize.STRING,
      validate: {
        is: ['^[a-f0-9]{64}$', 'i']
      },
      field: 'prev_hash',
      allowNull: false,
      unique: true
    },
    hash: {
      comment: 'Hex encoded SHA-256 over canonical values',
      type: Sequelize.STRING,
      validate: {
        is: ['^[a-f0-9]{64}$', 'i']
      },
      allowNull: false,
      unique: true
    },
    sig: {
      comment: 'Base64 encoded signature over block hash',
      type: Sequelize.STRING,
      validate: {
        is: ['^[a-zA-Z0-9\=\+\/]{1,255}$', 'i']
      },
      allowNull: false,
      unique: true
    }
  },
  {
    // no automatic timestamp fields, we add our own 'timestamp' so it is
    // known prior to save so it can be included in the block signature.
    timestamps: false,
    // disable the modification of table names; By default, sequelize will automatically
    // transform all passed model names (first parameter of define) into plural.
    // if you don't want that, set the following
    freezeTableName: true,
    // setup object lifecycle hooks
    hooks: {
      // beforeValidate: function (block, options) {
      //   console.log(block.get({plain: true}))
      // }
    }
  }
)

// FIXME : do our own hashing the 'chainpoint' way. and store data somewhere?
// Calculate a deterministic block hash from a whitelist of
// properties to hash, and canonicalize with objectHash.
let calcBlockHash = (block) => {
  let b = _.pick(block, [
    'id',
    'time',
    'version',
    'type',
    'data',
    'prevHash'])

  return objectHash(b)
}

// Calculate a base64 encoded signature over the block hash
let calcBlockHashSig = (bh) => {
  return nacl.util.encodeBase64(nacl.sign(bh, signingKeypair.secretKey))
}

let createGenesisBlock = () => {
  let b = {}
  b.id = 0
  b.time = new Date().getTime()
  b.version = 1
  b.type = 'cal'
  b.data = zeroStr
  b.prevHash = zeroStr

  let bh = calcBlockHash(b)
  b.hash = bh.toString('hex')
  b.sig = calcBlockHashSig(bh)

  CalendarBlock.create(b)
  .then((block) => {
    // console.log(block.get({plain: true}))
    console.log('GENESIS BLOCK : id : ' + block.get({plain: true}).id)
  })
  .catch(err => {
    console.error('createGenesisBlock create error: ' + err.message + ' : ' + err.stack)
  })
  .then(() => {
    // always release the lock, whether success or failure
    genesisLock.release()
  })
}

let createCalendarBlock = (data) => {
  // Find the last block written so we can incorporate its hash as prevHash
  // in the new block and increment its block ID by 1.
  CalendarBlock.findOne({attributes: ['id', 'hash'], order: 'id DESC'}).then(prevBlock => {
    if (prevBlock) {
      let b = {}
      b.id = parseInt(prevBlock.id, 10) + 1
      b.time = new Date().getTime()
      b.version = 1
      b.type = 'cal'
      b.data = data
      b.prevHash = prevBlock.hash

      let bh = calcBlockHash(b)
      b.hash = bh.toString('hex')
      b.sig = calcBlockHashSig(bh)

      CalendarBlock.create(b)
      .then((block) => {
        // console.log(block.get({plain: true}))
        console.log('CAL BLOCK : id : ' + block.get({plain: true}).id)
      })
      .catch(err => {
        console.error('createCalendarBlock create error: ' + err.message + ' : ' + err.stack)
      })
      .then(() => {
        // always release the lock, whether success or failure
        calendarLock.release()
      })
    }
  })
}

// FIXME : DRY UP THE BLOCK CREATION FUNCTIONS
// FIXME : Pull in real Nist data via consul
let createNistBlock = (data) => {
  // Find the last block written so we can incorporate its hash as prevHash
  // in the new block and increment its block ID by 1.
  CalendarBlock.findOne({attributes: ['id', 'hash'], order: 'id DESC'}).then(prevBlock => {
    if (prevBlock) {
      let b = {}
      b.id = parseInt(prevBlock.id, 10) + 1
      b.time = new Date().getTime()
      b.version = 1
      b.type = 'nist'
      b.data = data
      b.prevHash = prevBlock.hash

      let bh = calcBlockHash(b)
      b.hash = bh.toString('hex')
      b.sig = calcBlockHashSig(bh)

      CalendarBlock.create(b)
      .then((block) => {
        // console.log(block.get({plain: true}))
        console.log('NIST BLOCK : id : ' + block.get({plain: true}).id)
      })
      .catch(err => {
        console.error('createNistBlock create error: ' + err.message + ' : ' + err.stack)
      })
      .then(() => {
        // always release the lock, whether success or failure
        nistLock.release()
      })
    }
  })
}

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
        console.log('amqpChannel connection established')
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
      case 'btcmon':
        // Consumes a tx  message from the btctx service
        consumeBtcMonMessage(msg)
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
          { r: suffix },
          { op: 'sha-256-x2' }
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

function consumeBtcMonMessage (msg) {
 // TODO: put dode that does stuff here
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

// Take work off of the AGGREGATION_ROOTS array and build Merkle tree
let generateCalendarTree = () => {
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

    // Collect and store the calendar id, Merkle root,
    // and proofs in an array where finalize() can find it
    let treeData = {}
    treeData.cal_id = uuidv1()

    let treeSize = merkleTools.getLeafCount()
    let proofData = []
    for (let x = 0; x < treeSize; x++) {
      // push the agg_id and corresponding proof onto the array
      let proofDataItem = {}
      proofDataItem.agg_id = rootsForTree[x].agg_id
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

// FIXME : REFACTOR TO SPLIT BLOCKCHAIN WRITE AND RMQ TO DIFF FUNCTIONS
// Write in-memory trees to calendar block DB and
// also to proof state service via RMQ
let persistCalendarTrees = () => {
  // if the amqp channel is null (closed), processing
  // should not continue, defer to next persistCalendarTrees call
  if (amqpChannel === null) return

  // process each set of tree data
  let treesToPersist = TREES.splice(0)
  _.forEach(treesToPersist, (treeDataObj) => {
    console.log('Processing tree', treesToPersist.indexOf(treeDataObj) + 1, 'of', treesToPersist.length)

    // TODO store Merkle root of calendar in DB and chain to previous calendar entries
    console.log('calendar write')

    // queue proof state messages for each aggregation root in the tree
    async.series([
      (callback) => {
        // for each aggregation root, queue up message containing
        // updated proof state bound for proof state service
        async.each(treeDataObj.proofData, (proofDataItem, eachCallback) => {
          let stateObj = {}
          stateObj.agg_id = proofDataItem.agg_id
          stateObj.agg_hash_count = proofDataItem.agg_hash_count
          stateObj.cal_id = treeDataObj.cal_id
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
            console.error('Processing of tree', treesToPersist.indexOf(treeDataObj) + 1, 'had errors.')
            return callback(err)
          } else {
            console.log('Processing of tree', treesToPersist.indexOf(treeDataObj) + 1, 'complete')
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

let aggregateAndAnchorETH = () => {
  // TODO
  console.log('TODO aggregateAndAnchorETH()')
}

// Aggregate all block hashes on chain since last anchor block, add new anchor block to calendar, add new proof state entries, anchor root
let aggregateAndAnchorBTC = () => {
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
        stateObj.anchor_agg_id = treeData.anchor_agg_id
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

      // Send anchorData to the btc tx service for anchoring
      // FIXME : Note, CRITICAL to always release lock no matter what goes wrong.
      amqpChannel.sendToQueue(RMQ_WORK_OUT_BTCTX_QUEUE, Buffer.from(JSON.stringify(anchorData)), { persistent: true },
        (err, ok) => {
          if (err !== null) {
            console.error(RMQ_WORK_OUT_BTCTX_QUEUE, 'publish message nacked')
            return callback(err)
          } else {
            console.log(RMQ_WORK_OUT_BTCTX_QUEUE, 'publish message acked')
            return callback(null)
          }
        })
    }
  ], (err) => {
    if (err) {
      console.error(err)
    } else {
      console.error('aggregateAndAnchorBTC process complete.')
    }
  })
}

// SERVICE SETUP : AMQP initialization
amqpOpenConnection(RABBITMQ_CONNECT_URI)

// Each of these locks must be defined up front since event handlers
// need to be registered for each. They are all effectively locking the same
// resource since they share the same CALENDAR_LOCK_KEY. The value is
// purely informational and allows you to see which entity is currently
// holding a lock in the Consul admin web app.
//
// See also : https://github.com/hashicorp/consul/blob/master/api/lock.go#L21
//
var lockOpts = {
  key: CALENDAR_LOCK_KEY,
  lockwaittime: '60s',
  lockwaittimeout: '60s',
  lockretrytime: '100ms',
  session: {
    behavior: 'delete',
    checks: ['serfHealth'],
    lockdelay: '1ms',
    name: 'calendar-blockchain-lock',
    ttl: '30s'
  }
}

var genesisLock = consul.lock(_.merge({}, lockOpts, {value: 'genesis'}))
var calendarLock = consul.lock(_.merge({}, lockOpts, {value: 'calendar'}))
var nistLock = consul.lock(_.merge({}, lockOpts, {value: 'nist'}))
var btcAnchorLock = consul.lock(_.merge({}, lockOpts, {value: 'btc-anchor'}))
var btcConfirmLock = consul.lock(_.merge({}, lockOpts, {value: 'btc-confirm'}))
var ethAnchorLock = consul.lock(_.merge({}, lockOpts, {value: 'eth-anchor'}))
var ethConfirmLock = consul.lock(_.merge({}, lockOpts, {value: 'eth-confirm'}))

// Sync models to DB tables and trigger check
// if a new genesis block is needed.
// sequelize.sync({ force: true, logging: console.log })
sequelize.sync({ logging: console.log })
  .then(() => {
    console.log('CalendarBlock sequelize database synchronized')
  })
  .then(() => {
    // trigger creation of the genesis block
    genesisLock.acquire()
  })
  .catch((err) => {
    console.error('sequelize.sync() error: ' + err.stack)
    process.exit(1)
  })

// LOCK HANDLERS : genesis

genesisLock.on('acquire', () => {
  console.log('genesisLock acquired')
  // The value of the lock determines what function it triggers
  // Is a genesis block needed? If not release lock and move on.
  CalendarBlock.count().then(c => {
    if (c === 0) {
      createGenesisBlock()
    } else {
      genesisLock.release()
      console.log('No genesis block needed : ' + c + ' blocks found.')
    }
  })
})

genesisLock.on('error', (err) => {
  console.log('genesisLock error: ', err)
})

genesisLock.on('release', () => {
  console.log('genesisLock release')
})

genesisLock.on('end', () => {
  console.log('genesisLock end')
})

// LOCK HANDLERS : calendar

calendarLock.on('acquire', () => {
  console.log('calendarLock acquired')

  // FIXME : fakeData hash being inserted now just for testing.
  let fakeData = objectHash({time: new Date().getTime()}).toString('hex')
  createCalendarBlock(fakeData)
})

calendarLock.on('error', (err) => {
  console.log('calendarLock error: ', err)
})

calendarLock.on('release', () => {
  console.log('calendarLock release')
})

calendarLock.on('end', () => {
  console.log('calendarLock end')
})

// LOCK HANDLERS : nist

nistLock.on('acquire', () => {
  console.log('nistLock acquired')

  // FIXME : fakeData hash being inserted now just for testing.
  let fakeData = objectHash({time: new Date().getTime()}).toString('hex')
  createNistBlock(fakeData)
})

nistLock.on('error', (err) => {
  console.log('nistLock error: ', err)
})

nistLock.on('release', () => {
  console.log('nistLock release')
})

nistLock.on('end', () => {
  console.log('nistLock end')
})

// LOCK HANDLERS : btc-anchor

btcAnchorLock.on('acquire', () => {
  console.log('btcAnchorLock acquired')
})

btcAnchorLock.on('error', (err) => {
  console.log('btcAnchorLock error: ', err)
})

btcAnchorLock.on('release', () => {
  console.log('btcAnchorLock release')
})

btcAnchorLock.on('end', () => {
  console.log('btcAnchorLock end')
})

// LOCK HANDLERS : btc-confirm

btcConfirmLock.on('acquire', () => {
  console.log('btcConfirmLock acquired')
})

btcConfirmLock.on('error', (err) => {
  console.log('btcConfirmLock error: ', err)
})

btcConfirmLock.on('release', () => {
  console.log('btcConfirmLock release')
})

btcConfirmLock.on('end', () => {
  console.log('btcConfirmLock end')
})

// LOCK HANDLERS : eth-anchor

ethAnchorLock.on('acquire', () => {
  console.log('ethAnchorLock acquired')
})

ethAnchorLock.on('error', (err) => {
  console.log('ethAnchorLock error: ', err)
})

ethAnchorLock.on('release', () => {
  console.log('ethAnchorLock release')
})

ethAnchorLock.on('end', () => {
  console.log('ethAnchorLock end')
})

// LOCK HANDLERS : eth-confirm

ethConfirmLock.on('acquire', () => {
  console.log('ethConfirmLock acquired')
})

ethConfirmLock.on('error', (err) => {
  console.log('ethConfirmLock error: ', err)
})

ethConfirmLock.on('release', () => {
  console.log('ethConfirmLock release')
})

ethConfirmLock.on('end', () => {
  console.log('ethConfirmLock end')
})

// PERIODIC TIMERS

// Write a new calendar block
setInterval(() => {
  try {
    calendarLock.acquire()
  } catch (err) {
    console.error('calendarLock.acquire() : caught err : ', err.message)
  }
}, CALENDAR_INTERVAL_MS)

// Write a new NIST block
setInterval(() => {
  try {
    nistLock.acquire()
  } catch (err) {
    console.error('nistLock.acquire() : caught err : ', err.message)
  }
}, NIST_INTERVAL_MS)

// generate in-memory trees and proofs : every 1000ms
setInterval(() => generateCalendarTree(), CALENDAR_INTERVAL_MS)

// FIXME : Should this be periodic? Or triggered by lockCalendarBlock()
// put this in the lock block and call the createCalendarBlock from within this function instead of directly in the event block as it is now.
// persist in-memory trees to calendar block and PSS every 250ms
setInterval(() => persistCalendarTrees(), TREE_PERSIST_INTERVAL_MS)

// Add all block hashes back to the previous ETH anchor to a Merkle
// tree and send to ETH TX
setInterval(() => aggregateAndAnchorETH(), ANCHOR_ETH_INTERVAL_MS)

// Add all block hashes back to the previous BTC anchor to a Merkle
// tree and send to BTC TX
// FIXME : change ANCHOR_BTC_INTERVAL_MS to a one second tick interval
// FIXME : don't call aggregateAndAnchorBTC() directly, instead, acquire a btcAnchorLock
// FIXME : In the btcAnchorLock .on('acquire) handler, call aggregateAndAnchorBTC()
// FIXME : aggregateAndAnchorBTC() checks if the last anchor block is equal or older to some new val (10 min)
// FIXME : Only if last anchor was older/equal to 10 min, do we write a new anchor and do the work of that function. Otherwise immediate release lock.
setInterval(() => aggregateAndAnchorBTC(), ANCHOR_BTC_INTERVAL_MS)
