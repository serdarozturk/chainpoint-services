const _ = require('lodash')
const MerkleTools = require('merkle-tools')

require('dotenv').config()

// An array of all hashes needing to be processed.
// Will be filled from the left as new hashes arrive
// on the queue. Aggregation function will take hashes
// off the right side (oldest) to process.
let HASHES = []

// An array of all tree data ready to be finalized.
// Will be filled by the aggregation process as the
// merkle trees are built. Each object in this array
// contains the merkle root and the proof paths for
// each leaf of the tree.
let TREES = []

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

// The name of the RabbitMQ hash for incoming hashes to process
const HASH_INGRESS_QUEUE_NAME = process.env.HASH_INGRESS_QUEUE_NAME || 'hash_ingress'

// FIXME : This RabbitMQ client code is not playing nicely yet with
// RMQ running in Docker compose. This service starts way before RMQ
// has finished initializing and throws connection errors. For the
// moment I have configured it to talk to a locally installed (e.g. brew)
// RMQ service instead of `rabbitmq` docker/l5d host name. Need to figure
// out a gracefull fallback for this lib with auto-retry connect.

// AMQP / RabbitMQ
const open = require('amqplib').connect()
// const open = require('amqplib').connect('amqp://chainpoint:chainpoint@rabbitmq')

// Continuously load the HASHES from RMQ with hash objects to process
open.then(function (conn) {
  return conn.createChannel()
}).then(function (ch) {
  return ch.assertQueue(HASH_INGRESS_QUEUE_NAME).then(function (ok) {
    return ch.consume(HASH_INGRESS_QUEUE_NAME, function (msg) {
      if (msg !== null) {
        let incomingHashBatch = JSON.parse(msg.content.toString()).hashes

        // process each hash in a batch of hashes as submitted
        // to the API
        _.forEach(incomingHashBatch, function (hashObj) {
          console.log(hashObj)
          HASHES.unshift(hashObj)
        })

        ch.ack(msg) // TODO: Store this msg an ack it after finalize() instead?
      }
    })
  })
}).catch(console.warn)

// Take work off of the HASHES array and build Merkle tree
let aggregate = function () {
  console.log('merkling every %sms ...', AGGREGATION_INTERVAL)
  let hashesForTree = []

  _.times(HASHES_PER_MERKLE_TREE, function () {
    let hash = HASHES.pop()
    if (hash) {
      hashesForTree.push(hash)
    }
  })

  // create merkle tree only if there is at least one hash to process
  if (hashesForTree.length > 0) {
    let merkleTools = new MerkleTools()

    // Add every hash in hashesForTree to new Merkle tree
    merkleTools.addLeaves(hashesForTree.map(hashObj => hashObj.hash))
    merkleTools.makeTree()

    // Collect and store the Merkle root and proofs in a process local Array where finalize() can find it
    let treeData = {}
    treeData.merkleRoot = merkleTools.getMerkleRoot().toString('hex')

    let treeSize = merkleTools.getLeafCount()
    let proofs = []
    for (let x = 0; x < treeSize; x++) {
      proofs.push(merkleTools.getProof(x))
    }
    treeData.proofs = proofs

    TREES.unshift(treeData)
  }

  console.log('HASHES length : %s', HASHES.length)
  console.log('hashesForTree length : %s', hashesForTree.length)
  console.log(hashesForTree)
}

// Finalize already aggregated hash proofs by writing
// them to persistent store and sending ACK back to RMQ
// to report a BATCH of hashes has been processed.
let finalize = function () {
  console.log('Finalizing...')

  // TODO : All of these in a gRPC transaction? All or none?
  //   TODO : Persist each Merkle root to external service
  //   TODO : Persist each proof to external service
  //   TODO : Send ACK to RMQ for each BATCH we originally received.
}

setInterval(() => finalize(), FINALIZATION_INTERVAL)

setInterval(() => aggregate(), AGGREGATION_INTERVAL)
