const _ = require('lodash')
const MerkleTools = require('merkle-tools')
const amqp = require('amqplib')
const crypto = require('crypto')

require('dotenv').config()

// Generate a v1 UUID (time-based)
// see: https://github.com/broofa/node-uuid
const uuidv1 = require('uuid/v1')

// An array of message objects contianing an id, a hash count, and the message itself
// This is nessecary to track all the hash_ingress messages received and the number
// of hashes in each message. This information is used by the
// finalize method to know when all hashes from a message are processed
// and the message is ready to be acked.
let MESSAGES = []

// An array of all hashes needing to be processed.
// Will be filled as new hashes arrive on the queue.
let HASHES = []

// An array of all tree data ready to be finalized.
// Will be filled by the aggregation process as the
// merkle trees are built. Each object in this array
// contains the merkle root and the proof paths for
// each leaf of the tree.
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

// The name of the RabbitMQ queue for incoming hashes to process
const HASH_INGRESS_QUEUE_NAME = process.env.HASH_INGRESS_QUEUE_NAME || 'hash_ingress'

// The name of the RabbitMQ queue for sending data to a Calendar service
const CALENDAR_QUEUE_NAME = process.env.CALENDAR_QUEUE_NAME || 'calendar_ingress'

// TODO: Validate env variables and exit if values are out of bounds

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
      MESSAGES = HASHES = TREES = []
      setTimeout(amqpOpenConnection.bind(null, connectionString), 5 * 1000)
    })
    conn.createConfirmChannel().then(function (chan) {
      // the connection and channel have been established
      // set 'amqpChannel' so that publishers have access to the channel
      console.log('Connection established')
      amqpChannel = chan

      // Continuously load the HASHES from RMQ with hash objects to process
      return amqpChannel.assertQueue(HASH_INGRESS_QUEUE_NAME).then(function (ok) {
        return amqpChannel.consume(HASH_INGRESS_QUEUE_NAME, function (msg) {
          if (msg !== null) {
            let incomingHashBatch = JSON.parse(msg.content.toString()).hashes

            // record message and size for later reference
            // workingCount represents the number of hashes in the message
            // that have not been finalized. Whne the count reaches 0, the
            // message may be acked.
            let messageId = uuidv1()
            MESSAGES.push({
              id: messageId,
              workingCount: incomingHashBatch.length,
              msg: msg
            })

            // process each hash in a batch of hashes as submitted
            // to the API
            _.forEach(incomingHashBatch, function (hashObj) {
              console.log(hashObj)

              // add association between the hashObject and the messsage it came from
              hashObj.messageId = messageId
              HASHES.push(hashObj)
            })
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
var rmqURI = 'amqp://chainpoint:chainpoint@rabbitmq'
amqpOpenConnection(rmqURI)

// Take work off of the HASHES array and build Merkle tree
let aggregate = function () {
  // if the amqp channel is null (closed), processing should not continue, defer to next aggregate call
  if (amqpChannel === null) return
  console.log('merkling every %sms ...', AGGREGATION_INTERVAL)

  let hashesForTree = HASHES.splice(0, HASHES_PER_MERKLE_TREE)

  // create merkle tree only if there is at least one hash to process
  if (hashesForTree.length > 0) {
    // clear the merkleTools instance to prepare for a new tree
    merkleTools.resetTree()

    // concatonate and hash the hash ids and hash values into new array
    let leaves = hashesForTree.map(hashObj => {
      let idBuffer = Buffer.from(hashObj.id, 'utf8')
      let hashBuffer = Buffer.from(hashObj.hash, 'hex')
      return crypto.createHash('sha256').update(Buffer.concat([idBuffer, hashBuffer])).digest('hex')
    })

    // Add every hash in hashesForTree to new Merkle tree
    merkleTools.addLeaves(leaves)
    merkleTools.makeTree()

    // Collect and store the aggrfegation id, Merkle root, and proofs in an array where finalize() can find it
    let treeData = {}
    treeData.id = uuidv1()
    treeData.root = merkleTools.getMerkleRoot().toString('hex')

    let treeSize = merkleTools.getLeafCount()
    let proofs = []
    for (let x = 0; x < treeSize; x++) {
      // push the proof onto the array, inserting the UUID concat/hash step at the beginning
      proofs.push(merkleTools.getProof(x).unshift({ left: hashesForTree[x].id }))
    }
    treeData.proofs = proofs

    // add the message ids and the corresponding hash counts per message id being processed in this tree
    var messageTotals = hashesForTree.reduce((msgTotals, hashObj) => {
      msgTotals[hashObj.messageId] = msgTotals[hashObj.messageId] >= 1 ? msgTotals[hashObj.messageId] + 1 : 1
      return msgTotals
    }, {})
    treeData.messageTotals = messageTotals

    TREES.push(treeData)
  }

  console.log('hashesForTree length : %s', hashesForTree.length)
}

// Finalize already aggregated hash proofs by writing
// them to persistent store and sending ACK back to RMQ
// to report a BATCH of hashes has been processed.
let finalize = function () {
  // if the amqp channel is null (closed), processing should not continue, defer to next finalize call
  if (amqpChannel === null) return
  console.log('Finalizing...')

  // process each set of tree data
  let treesToFinalize = TREES.splice(0)
  _.forEach(treesToFinalize, function (treeDataObj) {
    console.log('Processing tree', treesToFinalize.indexOf(treeDataObj) + 1, 'of', treesToFinalize.length)

    // TODO : Persist proof data to State service via gRPC call
    // TODO : Send merkle roots to Calendar via RMQ message
    let calMessage = {} // TODO: populate this object
    amqpChannel.sendToQueue(CALENDAR_QUEUE_NAME, new Buffer(JSON.stringify(calMessage)), { persistent: true },
    function (err, ok) {
      if (err !== null) {
        console.error(CALENDAR_QUEUE_NAME, 'message publish nacked')
      } else {
        console.log(CALENDAR_QUEUE_NAME, 'message publish acked')
        // Hashes have been sucessfully finalized, update workingCounts in MESSAGES for each messageId
        for (var messageId in treeDataObj.messageTotals) {
          if (treeDataObj.messageTotals.hasOwnProperty(messageId)) {
            // Reduce the global workingCount for the message by the number in the current tree.
            // If the workingCount reaches 0, the entire set of hashes from the message has been finalized,
            // so ack the message and remove the message object from MESSAGES.
            let msgIndex = MESSAGES.findIndex((msg) => {
              return msg.id === messageId
            })
            MESSAGES[msgIndex].workingCount -= treeDataObj.messageTotals[messageId]
            if (MESSAGES[msgIndex].workingCount === 0) {
              let messageToAckArray = MESSAGES.splice(msgIndex, 1)
              amqpChannel.ack(messageToAckArray[0].msg)
              console.log(HASH_INGRESS_QUEUE_NAME, 'message consume acked')
            }
          }
        }
      }
    })
  })
}

setInterval(() => finalize(), FINALIZATION_INTERVAL)

setInterval(() => aggregate(), AGGREGATION_INTERVAL)
