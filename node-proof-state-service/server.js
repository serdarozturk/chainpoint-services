const amqp = require('amqplib')
const async = require('async')

const storageClient = require('./storage-adapters/crate.js')

require('dotenv').config()

// the name of the RabbitMQ topic exchange to use
const RMQ_WORK_EXCHANGE_NAME = process.env.RMQ_WORK_EXCHANGE_NAME || 'work_topic_exchange'

// the topic exchange routing key for message consumption originating from all other services
const RMQ_WORK_IN_ROUTING_KEY = process.env.RMQ_WORK_IN_ROUTING_KEY || 'work.*.state'

// the topic exchange routing key for message consumption originating from splitter service
const RMQ_WORK_IN_SPLITTER_ROUTING_KEY = process.env.RMQ_WORK_IN_SPLITTER_ROUTING_KEY || 'work.splitter.state'

// the topic exchange routing key for message consumption originating from aggregator service
const RMQ_WORK_IN_AGG_ROUTING_KEY = process.env.RMQ_WORK_IN_AGG_ROUTING_KEY || 'work.agg.state'

// the topic exchange routing key for message consumption originating from calendar service
const RMQ_WORK_IN_CAL_ROUTING_KEY = process.env.RMQ_WORK_IN_CAL_ROUTING_KEY || 'work.cal.state'

// the topic exchange routing key for message consumption originating from proof state service
const RMQ_WORK_IN_STATE_ROUTING_KEY = process.env.RMQ_WORK_IN_STATE_ROUTING_KEY || 'work.state.state'

// the topic exchange routing key for message publishing bound for the proof state service for proof state data retrieval
const RMQ_WORK_OUT_STATE_ROUTING_KEY = process.env.RMQ_WORK_OUT_STATE_ROUTING_KEY || 'work.state.state'

// the topic exchange routing key for message publishing bound for the proof generation service for calendar generation
const RMQ_WORK_OUT_CAL_GEN_ROUTING_KEY = process.env.RMQ_WORK_OUT_CAL_GEN_ROUTING_KEY || 'work.generator.cal'

// the topic exchange routing key for message publishing bound for the proof generation service for eth anchor generation
const RMQ_WORK_OUT_ETH_GEN_ROUTING_KEY = process.env.RMQ_WORK_OUT_ETH_GEN_ROUTING_KEY || 'work.generator.eth'

// the topic exchange routing key for message publishing bound for the proof generation service for btc anchor generation
const RMQ_WORK_OUT_BTC_GEN_ROUTING_KEY = process.env.RMQ_WORK_OUT_BTC_GEN_ROUTING_KEY || 'work.generator.btc'

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
      console.error(msg.fields.routingKey, 'consume message nacked - ' + JSON.stringify(err))
    } else {
      // vent has been logged, ack consumption of original message
      amqpChannel.ack(msg)
      console.log(msg.fields.routingKey, 'consume message acked')
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
      console.error(msg.fields.routingKey, 'consume message nacked - ' + JSON.stringify(err))
    } else {
      // New message has been published and event logged, ack consumption of original message
      amqpChannel.ack(msg)
      console.log(msg.fields.routingKey, 'consume message acked')
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
        console.log(count, stateObj.agg_hash_count)
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
        amqpChannel.publish(RMQ_WORK_EXCHANGE_NAME, RMQ_WORK_OUT_STATE_ROUTING_KEY, new Buffer(JSON.stringify(dataOutObj)), { persistent: true },
          (err, ok) => {
            if (err) {
              console.error(RMQ_WORK_OUT_STATE_ROUTING_KEY, 'publish message nacked')
              return eachCallback(err)
            } else {
              console.log(RMQ_WORK_OUT_STATE_ROUTING_KEY, 'publish message acked')
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
          console.error(msg.fields.routingKey, 'consume message nacked - ' + JSON.stringify(err))
        }, 1000)
      } else {
        amqpChannel.nack(msg)
        console.error(msg.fields.routingKey, 'consume message nacked - ' + JSON.stringify(err))
      }
    } else {
      // New messages have been published, ack consumption of original message
      amqpChannel.ack(msg)
      console.log(msg.fields.routingKey, 'consume message acked')
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
          storageClient.getAggStateObjectByHashId(messageObj.hash_id, (err, rows) => {
            if (err) return callback(err)
            if (rows.length !== 1) return callback(new Date().toISOString() + ' no matching add_state data found')
            return callback(null, rows[0])
          })
        },
        (aggStateObj, callback) => {
          // get the cal_state object for the hash_id's agg_id
          storageClient.getCalStateObjectByAggId(aggStateObj.agg_id, (err, rows) => {
            if (err) return callback(err)
            if (rows.length !== 1) return callback(new Date().toISOString() + ' no matching cal_state data found')
            return callback(null, aggStateObj, rows[0])
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
          amqpChannel.publish(RMQ_WORK_EXCHANGE_NAME, RMQ_WORK_OUT_CAL_GEN_ROUTING_KEY, new Buffer(JSON.stringify(dataOutObj)), { persistent: true },
            (err, ok) => {
              if (err) {
                console.error(RMQ_WORK_OUT_CAL_GEN_ROUTING_KEY, 'publish message nacked')
                return callback(err)
              } else {
                console.log(RMQ_WORK_OUT_CAL_GEN_ROUTING_KEY, 'publish message acked')
                return callback(null, dataOutObj.hash_id)
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
          console.error(msg.fields.routingKey, 'consume message nacked - ' + JSON.stringify(err))
        } else {
          // Proof ready message has been consumed, ack consumption of original message
          amqpChannel.ack(msg)
          console.log(msg.fields.routingKey, 'consume message acked')
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
    switch (msg.fields.routingKey) {
      case RMQ_WORK_IN_SPLITTER_ROUTING_KEY:
        // Consumes a state message from the Splitter service
        // Logs event in hash tracker
        ConsumeSplitterMessage(msg)
        break
      case RMQ_WORK_IN_AGG_ROUTING_KEY:
        // Consumes a state message from the Aggregator service
        // Stores state information and logs event in hash tracker
        ConsumeAggregationMessage(msg)
        break
      case RMQ_WORK_IN_CAL_ROUTING_KEY:
        // Consumes a state message from the Calendar service
        // Stores state information and publishes proof ready messages bound for the proof state service
        ConsumeCalendarMessage(msg)
        break
      case RMQ_WORK_IN_STATE_ROUTING_KEY:
        // Consumes a proof ready message from the proof state service
        // Retrieves all proof state data for a given hash, publishes message bound for the proof generator service, and logs event in hash tracker
        ConsumeProofReadyMessage(msg)
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
  amqp.connect(connectionString).then((conn) => {
    conn.on('close', () => {
      // if the channel closes for any reason, attempt to reconnect
      console.error('Connection to RMQ closed.  Reconnecting in 5 seconds...')
      amqpChannel = null
      setTimeout(amqpOpenConnection.bind(null, connectionString), 5 * 1000)
    })
    conn.createConfirmChannel().then((chan) => {
      // the connection and channel have been established
      // set 'amqpChannel' so that publishers have access to the channel
      console.log('Connection established')
      chan.assertExchange(RMQ_WORK_EXCHANGE_NAME, 'topic', { durable: true })
      amqpChannel = chan

      // Continuously load the HASHES from RMQ with hash objects to process
      return chan.assertQueue('', { durable: true }).then((q) => {
        chan.bindQueue(q.queue, RMQ_WORK_EXCHANGE_NAME, RMQ_WORK_IN_ROUTING_KEY)
        return chan.consume(q.queue, (msg) => {
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
