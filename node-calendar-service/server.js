const _ = require('lodash')
const MerkleTools = require('merkle-tools')
const amqp = require('amqplib')

require('dotenv').config()

// The frequency to generate new calendar trees
const CALENDAR_INTERVAL = process.env.CALENDAR_INTERVAL || 1000

// The name of the RabbitMQ queue for receiving data from aggregator service
const CALENDAR_INGRESS_QUEUE = process.env.CALENDAR_INGRESS_QUEUE || 'calendar_ingress'

// Connection string w/ credentials for RabbitMQ
const RABBITMQ_CONNECT_URI = process.env.RABBITMQ_CONNECT_URI || 'amqp://chainpoint:chainpoint@rabbitmq'

// TODO: Validate env variables and exit if values are out of bounds

// The merkle tools object for building trees and generating proof paths
const merkleTools = new MerkleTools()

// An array of all Merkle tree roots from aggregators needing
// to be processed. Will be filled as new roots arrive on the queue.
let AGGREGATION_ROOTS = []

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
  amqp.connect(connectionString).then(function (conn) {
    conn.on('close', () => {
      // if the channel closes for any reason, attempt to reconnect
      console.error('Connection to RMQ closed.  Reconnecting in 5 seconds...')
      amqpChannel = null
      setTimeout(amqpOpenConnection.bind(null, connectionString), 5 * 1000)
    })
    conn.createConfirmChannel().then(function (chan) {
      // the connection and channel have been established
      // set 'amqpChannel' so that publishers have access to the channel
      console.error('Connection established')
      amqpChannel = chan

      // Continuously load the aggregation tree roots from RMQ
      return amqpChannel.assertQueue(CALENDAR_INGRESS_QUEUE).then(function (ok) {
        return amqpChannel.consume(CALENDAR_INGRESS_QUEUE, function (msg) {
          if (msg !== null) {
            let rootObj = JSON.parse(msg.content.toString())
            AGGREGATION_ROOTS.push(rootObj)
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

// TODO aggregate the incoming roots stored in AGGREGATION_ROOTS
// TODO generate Merkle tree from roots
// TODO collect proofs for each root leaf node and associate to hashes
// TODO store Merkle root of calendar in DB and chain to previous calendar entries
// TODO store proofs for roots with their associated hashes in proof service to build calendar attestation proof
let generateCalendar = function () {
  console.log('Calendaring...')
  console.log('AGGREGATION_ROOTS : %s', JSON.stringify(AGGREGATION_ROOTS))
}

setInterval(() => generateCalendar(), CALENDAR_INTERVAL)
