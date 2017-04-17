const amqp = require('amqplib')
const _ = require('lodash')

require('dotenv').config()

// the name of the RabbitMQ topic exchange to use
const RMQ_WORK_EXCHANGE_NAME = process.env.RMQ_WORK_EXCHANGE_NAME || 'work_topic_exchange'

// the topic exchange routing key for all message consumption originating from proof state services
const RMQ_WORK_IN_ROUTING_KEY = process.env.RMQ_WORK_IN_ROUTING_KEY || 'work.generator.*'

// the topic exchange routing key for cal generation message consumption originating from calendar service
const RMQ_WORK_IN_CAL_ROUTING_KEY = process.env.RMQ_WORK_IN_CAL_ROUTING_KEY || 'work.generator.cal'

// the topic exchange routing key for eth generation message consumption originating from ethereum anchor service
const RMQ_WORK_IN_ETH_ROUTING_KEY = process.env.RMQ_WORK_IN_ETH_ROUTING_KEY || 'work.generator.eth'

// the topic exchange routing key for btc generation message consumption originating from btc anchor service
const RMQ_WORK_IN_BTC_ROUTING_KEY = process.env.RMQ_WORK_IN_BTC_ROUTING_KEY || 'work.generator.btc'

// Connection string w/ credentials for RabbitMQ
const RABBITMQ_CONNECT_URI = process.env.RABBITMQ_CONNECT_URI || 'amqp://chainpoint:chainpoint@rabbitmq'

function generateCALProof (msg) {
  console.log('building cal proof')
}
function generateETHProof (msg) {
  console.log('building eth proof')
}
function generateBTCProof (msg) {
  console.log('building btc proof')
}

/**
* Parses a message and performs the required work for that message
*
* @param {amqp message object} msg - The AMQP message received from the queue
*/
function processMessage (msg) {
  if (msg !== null) {
    // determine the source of the message and handle appropriately
    switch (msg.fields.routingKey) {
      case RMQ_WORK_IN_CAL_ROUTING_KEY:
        // Consumes a generate calendar proof message
        generateCALProof(msg)
        break
      case RMQ_WORK_IN_ETH_ROUTING_KEY:
        // Consumes a generate eth anchor proof message
        // Stores state information and publishes message bound for Generator
        generateETHProof(msg)
        break
      case RMQ_WORK_IN_BTC_ROUTING_KEY:
        // Consumes a generate btc anchor proof message
        // Stores state information and publishes message bound for Generator
        generateBTCProof(msg)
        break
      default:
        // This is an unknown state type, unknown routing key
        console.error('Unknown state type or routing key', msg.fields.routingKey)
    }
  }
}

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
      setTimeout(amqpOpenConnection.bind(null, connectionString), 5 * 1000)
    })
    conn.createConfirmChannel().then(function (chan) {
      // the connection and channel have been established
      // set 'amqpChannel' so that publishers have access to the channel
      console.log('Connection established')
      chan.assertExchange(RMQ_WORK_EXCHANGE_NAME, 'topic', { durable: true })

      // Continuously load the HASHES from RMQ with hash objects to process
      return chan.assertQueue('', { durable: true }).then(function (q) {
        chan.bindQueue(q.queue, RMQ_WORK_EXCHANGE_NAME, RMQ_WORK_IN_ROUTING_KEY)
        return chan.consume(q.queue, function (msg) {
          processMessage(msg)
        })
      })
    })
  }).catch(() => {
    // catch errors when attempting to establish connection
    console.error('Cannot establish rmq connection. Attempting in 5 seconds...')
    setTimeout(amqpOpenConnection.bind(null, connectionString), 5 * 1000)
  })
}

// Open amqp connection
amqpOpenConnection(RABBITMQ_CONNECT_URI)
