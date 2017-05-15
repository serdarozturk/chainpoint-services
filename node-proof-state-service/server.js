const amqp = require('amqplib/callback_api')
const async = require('async')

const storageClient = require('./storage-adapters/postgres.js')

require('dotenv').config()

// THE maximum number of messages sent over the channel that can be awaiting acknowledgement, 0 = no limit
const RMQ_PREFETCH_COUNT = process.env.RMQ_PREFETCH_COUNT || 10

// The queue name for message consumption originating from the splitter, aggregator, calendar, and proof state services
const RMQ_WORK_IN_QUEUE = process.env.RMQ_WORK_IN_QUEUE || 'work.state'

// The queue name for outgoing message to the proof state service
const RMQ_WORK_OUT_STATE_QUEUE = process.env.RMQ_WORK_OUT_STATE_QUEUE || 'work.state'

// The queue name for outgoing message to the proof gen service
const RMQ_WORK_OUT_GEN_QUEUE = process.env.RMQ_WORK_OUT_GEN_QUEUE || 'work.gen'

// Connection string w/ credentials for RabbitMQ
const RABBITMQ_CONNECT_URI = process.env.RABBITMQ_CONNECT_URI || 'amqp://chainpoint:chainpoint@rabbitmq'
// The channel used for all amqp communication
// This value is set once the connection has been established
var amqpChannel = null

/**
* Logs Splitter service event to hash tracker
*
* @param {amqp message object} msg - The AMQP message received from the queue
*/
function ConsumeSplitterMessage (msg) {
  let messageObj = JSON.parse(msg.content.toString())

  // Store this state information
  storageClient.logSplitterEventForHashId(messageObj.hash_id, messageObj.hash, (err, success) => {
    if (err) {
      amqpChannel.nack(msg)
      console.error(msg.fields.routingKey, '[' + msg.properties.type + '] consume message nacked - ' + JSON.stringify(err))
    } else {
      // vent has been logged, ack consumption of original message
      amqpChannel.ack(msg)
      console.log(msg.fields.routingKey, '[' + msg.properties.type + '] consume message acked')
    }
  })
}
/**
* Writes the state data to persistent storage and logs aggregation event
*
* @param {amqp message object} msg - The AMQP message received from the queue
*/
function ConsumeAggregationMessage (msg) {
  let messageObj = JSON.parse(msg.content.toString())
  let stateObj = {}
  stateObj.type = 'agg'
  stateObj.hash_id = messageObj.hash_id
  stateObj.hash = messageObj.hash
  stateObj.agg_id = messageObj.agg_id
  stateObj.agg_root = messageObj.agg_root
  stateObj.agg_state = messageObj.agg_state

  async.series([
    (callback) => {
      // Store this state information
      storageClient.writeAggStateObject(stateObj, (err, success) => {
        if (err) return callback(err)
        return callback(null)
      })
    },
    (callback) => {
      // logs the aggregation event
      storageClient.logAggregatorEventForHashId(stateObj.hash_id, (err, success) => {
        if (err) return callback(err)
        return callback(null)
      })
    }
  ], (err) => {
    if (err) {
      amqpChannel.nack(msg)
      console.error(msg.fields.routingKey, '[' + msg.properties.type + '] consume message nacked - ' + JSON.stringify(err))
    } else {
      // New message has been published and event logged, ack consumption of original message
      amqpChannel.ack(msg)
      console.log(msg.fields.routingKey, '[' + msg.properties.type + '] consume message acked')
    }
  })
}

/**
* Writes the state data to persistent storage and queues proof ready messages bound for the proof state service
*
* @param {amqp message object} msg - The AMQP message received from the queue
*/
function ConsumeCalendarMessage (msg) {
  let messageObj = JSON.parse(msg.content.toString())
  let stateObj = {}
  stateObj.type = 'cal'
  stateObj.agg_id = messageObj.agg_id
  stateObj.agg_root = messageObj.agg_root
  stateObj.agg_hash_count = messageObj.agg_hash_count
  stateObj.cal_id = messageObj.cal_id
  stateObj.cal_root = messageObj.cal_root
  stateObj.cal_state = messageObj.cal_state

  async.waterfall([
    (callback) => {
      // get hash id count for a given agg_id
      storageClient.getHashIdCountByAggId(stateObj.agg_id, (err, count) => {
        if (err) return callback(err)
        if (count < stateObj.agg_hash_count) return callback('unable to read all hash data')
        return callback(null)
      })
    },
    (callback) => {
      // get all hash ids for a given agg_id
      storageClient.getHashIdsByAggId(stateObj.agg_id, (err, rows) => {
        if (err) return callback(err)
        return callback(null, rows)
      })
    },
    (rows, callback) => {
      // write the calendar state object to storage
      storageClient.writeCalStateObject(stateObj, (err, success) => {
        if (err) return callback(err)
        return callback(null, rows)
      })
    },
    (rows, callback) => {
      async.eachLimit(rows, 10, (hashIdRow, eachCallback) => {
        // construct a calendar 'proof ready' message for a given hash
        let dataOutObj = {}
        dataOutObj.type = 'cal'
        dataOutObj.hash_id = hashIdRow.hash_id
        // Publish a proof ready object for consumption by the proof state service
        amqpChannel.sendToQueue(RMQ_WORK_OUT_STATE_QUEUE, Buffer.from(JSON.stringify(dataOutObj)), { persistent: true, type: 'state' },
          (err, ok) => {
            if (err !== null) {
              // An error as occurred publishing a message
              console.error(RMQ_WORK_OUT_STATE_QUEUE, '[state] publish message nacked')
              return eachCallback(err)
            } else {
              // New message has been published
              console.log(RMQ_WORK_OUT_STATE_QUEUE, '[state] publish message acked')
              return eachCallback(null)
            }
          })
      }, (err) => {
        if (err) return callback(err)
        return callback(null)
      })
    }
  ], (err) => {
    if (err) {
      console.error('error consuming calendar message', err)
      // An error as occurred publishing a message, nack consumption of original message
      if (err === 'unable to read all hash data') {
        // delay the nack for 1000ms to slightly delay requeuing to prevent a flood of retries
        // until the data is read, in cases of hash data not being fully readable yet
        setTimeout(() => {
          amqpChannel.nack(msg)
          console.error(msg.fields.routingKey, '[' + msg.properties.type + '] consume message nacked - ' + JSON.stringify(err))
        }, 1000)
      } else {
        amqpChannel.nack(msg)
        console.error(msg.fields.routingKey, '[' + msg.properties.type + '] consume message nacked - ' + JSON.stringify(err))
      }
    } else {
      // New messages have been published, ack consumption of original message
      amqpChannel.ack(msg)
      console.log(msg.fields.routingKey, '[' + msg.properties.type + '] consume message acked')
    }
  })
}

/**
* Retrieves all proof state data for a given hash and publishes message bound for the proof generator service
*
* @param {amqp message object} msg - The AMQP message received from the queue
*/
function ConsumeProofReadyMessage (msg) {
  let messageObj = JSON.parse(msg.content.toString())

  switch (messageObj.type) {
    case 'cal':
      async.waterfall([
        (callback) => {
          // get the agg_state object for the hash_id
          storageClient.getAggStateObjectByHashId(messageObj.hash_id, (err, row) => {
            if (err) return callback(err)
            if (!row) return callback(new Date().toISOString() + ' no matching agg_state data found')
            return callback(null, row)
          })
        },
        (aggStateObj, callback) => {
          // get the cal_state object for the hash_id's agg_id
          storageClient.getCalStateObjectByAggId(aggStateObj.agg_id, (err, row) => {
            if (err) return callback(err)
            if (!row) return callback(new Date().toISOString() + ' no matching cal_state data found')
            return callback(null, aggStateObj, row)
          })
        },
        (aggStateObj, calStateObj, callback) => {
          let dataOutObj = {}
          dataOutObj.type = 'cal'
          dataOutObj.hash_id = aggStateObj.hash_id
          dataOutObj.hash = aggStateObj.hash
          dataOutObj.agg_state = JSON.parse(aggStateObj.agg_state)
          dataOutObj.cal_state = JSON.parse(calStateObj.cal_state)

          // Publish a proof data object for consumption by the proof generation service
          amqpChannel.sendToQueue(RMQ_WORK_OUT_GEN_QUEUE, Buffer.from(JSON.stringify(dataOutObj)), { persistent: true, type: 'cal' },
            (err, ok) => {
              if (err !== null) {
                // An error as occurred publishing a message
                console.error(RMQ_WORK_OUT_GEN_QUEUE, '[cal] publish message nacked')
                return callback(err)
              } else {
                // New message has been published
                console.log(RMQ_WORK_OUT_GEN_QUEUE, '[cal] publish message acked')
                return callback(null, aggStateObj.hash_id)
              }
            })
        },
        (hashId, callback) => {
          // logs the calendar proof event
          storageClient.logCalendarEventForHashId(hashId, (err, success) => {
            if (err) return callback(err)
            return callback(null)
          })
        }
      ], (err) => {
        if (err) {
          console.error('error consuming proof ready message', err)
          // An error as occurred consuming a message, nack consumption of original message
          amqpChannel.nack(msg)
          console.error(msg.fields.routingKey, '[' + msg.properties.type + '] consume message nacked - ' + JSON.stringify(err))
        } else {
          // Proof ready message has been consumed, ack consumption of original message
          amqpChannel.ack(msg)
          console.log(msg.fields.routingKey, '[' + msg.properties.type + '] consume message acked')
        }
      })
      break
    default:
      // This is an unknown proof ready type
      console.error('Unknown proof ready type', messageObj.type)
  }
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
      case 'splitter':
        // Consumes a state message from the Splitter service
        // Logs event in hash tracker
        ConsumeSplitterMessage(msg)
        break
      case 'aggregator':
        // Consumes a state message from the Aggregator service
        // Stores state information and logs event in hash tracker
        ConsumeAggregationMessage(msg)
        break
      case 'cal':
        // Consumes a state message from the Calendar service
        // Stores state information and publishes proof ready messages bound for the proof state service
        ConsumeCalendarMessage(msg)
        break
      case 'state':
        // Consumes a proof ready message from the proof state service
        // Retrieves all proof state data for a given hash, publishes message bound for the proof generator service, and logs event in hash tracker
        ConsumeProofReadyMessage(msg)
        break
      default:
        // This is an unknown state type
        console.error('Unknown state type', msg.properties.type)
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
        chan.assertQueue(RMQ_WORK_OUT_GEN_QUEUE, { durable: true })
        chan.prefetch(RMQ_PREFETCH_COUNT)
        amqpChannel = chan
        // Continuously load the HASHES from RMQ with hash objects to process
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
 * Opens a storage connection
 **/
function openStorageConnection (callback) {
  storageClient.openConnection((err, success) => {
    if (err) {
      // catch errors when attempting to establish connection
      if (err === 'not_ready') {
        // the storage service is not ready to accept connections, schedule retry
        console.error('Cannot establish storage connection. Attempting in 5 seconds...')
        setTimeout(openStorageConnection.bind(null, callback), 5 * 1000)
      } else {
        // a fatal error has occured, exit
        return callback('fatal error opening storage connection')
      }
    } else {
      return callback(null, true)
    }
  })
}

// Open storage connection and then amqp connection
openStorageConnection((err, result) => {
  if (err) {
    console.error(err)
  } else {
    amqpOpenConnection(RABBITMQ_CONNECT_URI)
  }
})
