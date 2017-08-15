// load all environment variables into env object
const env = require('./lib/parse-env.js')('state')

const amqp = require('amqplib')
const async = require('async')
const utils = require('./lib/utils.js')

const storageClient = require('./storage-adapters/postgres.js')

// The channel used for all amqp communication
// This value is set once the connection has been established
var amqpChannel = null

/**
* Writes the state data to persistent storage and logs aggregation event
*
* @param {amqp message object} msg - The AMQP message received from the queue
*/
async function ConsumeAggregationMessageAsync (msg) {
  let messageObj = JSON.parse(msg.content.toString())
  let stateObj = {}
  stateObj.hash_id = messageObj.hash_id
  stateObj.hash = messageObj.hash
  stateObj.agg_id = messageObj.agg_id
  stateObj.agg_state = messageObj.agg_state

  try {
    // Store this state information
    await storageClient.writeAggStateObjectAsync(stateObj)
    // logs the aggregation event
    await storageClient.logAggregatorEventForHashIdAsync(stateObj.hash_id)
    // New message has been published and event logged, ack consumption of original message
    amqpChannel.ack(msg)
    console.log(msg.fields.routingKey, '[' + msg.properties.type + '] consume message acked')
  } catch (error) {
    amqpChannel.nack(msg)
    console.error(msg.fields.routingKey, '[' + msg.properties.type + '] consume message nacked - ' + JSON.stringify(error))
  }
}

/**
* Writes the state data to persistent storage and queues proof ready messages bound for the proof state service
*
* @param {amqp message object} msg - The AMQP message received from the queue
*/
async function ConsumeCalendarMessageAsync (msg) {
  let messageObj = JSON.parse(msg.content.toString())
  let stateObj = {}
  stateObj.agg_id = messageObj.agg_id
  stateObj.cal_id = messageObj.cal_id
  stateObj.cal_state = messageObj.cal_state

  try {
    // get hash id count for a given agg_id
    let count = await storageClient.getHashIdCountByAggIdAsync(stateObj.agg_id)
    if (count < messageObj.agg_hash_count) throw new Error('unable to read all hash data')
    let rows = await storageClient.getHashIdsByAggIdAsync(stateObj.agg_id)
    await storageClient.writeCalStateObjectAsync(stateObj)

    async.waterfall([
      async.constant(rows),
      (rows, callback) => {
        async.eachLimit(rows, 10, (hashIdRow, eachCallback) => {
          // construct a calendar 'proof ready' message for a given hash
          let dataOutObj = {}
          dataOutObj.type = 'cal'
          dataOutObj.hash_id = hashIdRow.hash_id
          // Publish a proof ready object for consumption by the proof state service
          amqpChannel.sendToQueue(env.RMQ_WORK_OUT_STATE_QUEUE, Buffer.from(JSON.stringify(dataOutObj)), { persistent: true, type: 'state' },
            (err, ok) => {
              if (err !== null) {
                // An error as occurred publishing a message
                console.error(env.RMQ_WORK_OUT_STATE_QUEUE, '[state] publish message nacked')
                return eachCallback(err)
              } else {
                // New message has been published
                console.log(env.RMQ_WORK_OUT_STATE_QUEUE, '[state] publish message acked')
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
        throw new Error(err.message)
      } else {
        // New messages have been published, ack consumption of original message
        amqpChannel.ack(msg)
        console.log(msg.fields.routingKey, '[' + msg.properties.type + '] consume message acked')
      }
    })
  } catch (error) {
    console.error('error consuming calendar message', error.message)
    // An error as occurred publishing a message, nack consumption of original message
    if (error.message === 'unable to read all hash data') {
      // delay the nack for 1000ms to slightly delay requeuing to prevent a flood of retries
      // until the data is read, in cases of hash data not being fully readable yet
      setTimeout(() => {
        amqpChannel.nack(msg)
        console.error(msg.fields.routingKey, '[' + msg.properties.type + '] consume message nacked - ' + error.message)
      }, 1000)
    } else {
      amqpChannel.nack(msg)
      console.error(msg.fields.routingKey, '[' + msg.properties.type + '] consume message nacked - ' + error.message)
    }
  }
}

/**
* Writes the state data to persistent storage
*
* @param {amqp message object} msg - The AMQP message received from the queue
*/
async function ConsumeAnchorAggMessageAsync (msg) {
  let messageObj = JSON.parse(msg.content.toString())
  let stateObj = {}
  stateObj.cal_id = messageObj.cal_id
  stateObj.anchor_agg_id = messageObj.anchor_agg_id
  stateObj.anchor_agg_state = messageObj.anchor_agg_state

  try {
    await storageClient.writeAnchorAggStateObjectAsync(stateObj)
    // New message has been published and event logged, ack consumption of original message
    amqpChannel.ack(msg)
    console.log(msg.fields.routingKey, '[' + msg.properties.type + '] consume message acked')
  } catch (error) {
    amqpChannel.nack(msg)
    console.error(msg.fields.routingKey, '[' + msg.properties.type + '] consume message nacked - ' + JSON.stringify(error))
  }
}

/**
* Writes the state data to persistent storage
*
* @param {amqp message object} msg - The AMQP message received from the queue
*/
async function ConsumeBtcTxMessageAsync (msg) {
  let messageObj = JSON.parse(msg.content.toString())
  let stateObj = {}
  stateObj.anchor_agg_id = messageObj.anchor_agg_id
  stateObj.btctx_id = messageObj.btctx_id
  stateObj.btctx_state = messageObj.btctx_state

  try {
    await storageClient.writeBTCTxStateObjectAsync(stateObj)
    // New message has been published and event logged, ack consumption of original message
    amqpChannel.ack(msg)
    console.log(msg.fields.routingKey, '[' + msg.properties.type + '] consume message acked')
  } catch (error) {
    amqpChannel.nack(msg)
    console.error(msg.fields.routingKey, '[' + msg.properties.type + '] consume message nacked - ' + JSON.stringify(error))
  }
}

/**
* Writes the state data to persistent storage and queues proof ready messages bound for the proof state service
*
* @param {amqp message object} msg - The AMQP message received from the queue
*/
async function ConsumeBtcMonMessageAsync (msg) {
  let messageObj = JSON.parse(msg.content.toString())
  let stateObj = {}
  stateObj.btctx_id = messageObj.btctx_id
  stateObj.btchead_height = messageObj.btchead_height
  stateObj.btchead_state = messageObj.btchead_state

  try {
    let rows = await storageClient.getHashIdsByBtcTxIdAsync(stateObj.btctx_id)
    await storageClient.writeBTCHeadStateObjectAsync(stateObj)

    async.waterfall([
      async.constant(rows),
      (rows, callback) => {
        async.eachLimit(rows, 10, (hashIdRow, eachCallback) => {
          // construct a calendar 'proof ready' message for a given hash
          let dataOutObj = {}
          dataOutObj.type = 'btc'
          dataOutObj.hash_id = hashIdRow.hash_id
          // Publish a proof ready object for consumption by the proof state service
          amqpChannel.sendToQueue(env.RMQ_WORK_OUT_STATE_QUEUE, Buffer.from(JSON.stringify(dataOutObj)), { persistent: true, type: 'state' },
            (err, ok) => {
              if (err !== null) {
                // An error as occurred publishing a message
                console.error(env.RMQ_WORK_OUT_STATE_QUEUE, '[state] publish message nacked')
                return eachCallback(err)
              } else {
                // New message has been published
                console.log(env.RMQ_WORK_OUT_STATE_QUEUE, '[state] publish message acked')
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
        throw new Error(err)
      } else {
        // New messages have been published, ack consumption of original message
        amqpChannel.ack(msg)
        console.log(msg.fields.routingKey, '[' + msg.properties.type + '] consume message acked')
      }
    })
  } catch (error) {
    console.error('error consuming calendar message', error)
    // An error as occurred publishing a message, nack consumption of original message
    amqpChannel.nack(msg)
    console.error(msg.fields.routingKey, '[' + msg.properties.type + '] consume message nacked - ' + JSON.stringify(error))
  }
}

/**
* Retrieves all proof state data for a given hash and publishes message bound for the proof generator service
*
* @param {amqp message object} msg - The AMQP message received from the queue
*/
async function ConsumeProofReadyMessageAsync (msg) {
  let messageObj = JSON.parse(msg.content.toString())

  switch (messageObj.type) {
    case 'cal':
      try {
        let aggStateRow = await storageClient.getAggStateObjectByHashIdAsync(messageObj.hash_id)
        if (!aggStateRow) throw new Error(new Date().toISOString() + ' no matching agg_state data found')
        let calStateRow = await storageClient.getCalStateObjectByAggIdAsync(aggStateRow.agg_id)
        if (!calStateRow) throw new Error(new Date().toISOString() + ' no matching cal_state data found')

        let dataOutObj = {}
        dataOutObj.type = 'cal'
        dataOutObj.hash_id = aggStateRow.hash_id
        dataOutObj.hash = aggStateRow.hash
        dataOutObj.agg_state = JSON.parse(aggStateRow.agg_state)
        dataOutObj.cal_state = JSON.parse(calStateRow.cal_state)

        // Publish a proof data object for consumption by the proof generation service
        amqpChannel.sendToQueue(env.RMQ_WORK_OUT_GEN_QUEUE, Buffer.from(JSON.stringify(dataOutObj)), { persistent: true, type: 'cal' },
          async (err, ok) => {
            if (err !== null) {
              // An error as occurred publishing a message
              console.error(env.RMQ_WORK_OUT_GEN_QUEUE, '[cal] publish message nacked')
              throw new Error(err)
            } else {
              // New message has been published
              console.log(env.RMQ_WORK_OUT_GEN_QUEUE, '[cal] publish message acked')
              // logs the calendar proof event
              await storageClient.logCalendarEventForHashIdAsync(aggStateRow.hash_id)
              // Proof ready message has been consumed, ack consumption of original message
              amqpChannel.ack(msg)
              console.log(msg.fields.routingKey, '[' + msg.properties.type + '] consume message acked')
            }
          })
      } catch (error) {
        console.error('error consuming proof ready message', error)
        // An error as occurred consuming a message, nack consumption of original message
        amqpChannel.nack(msg)
        console.error(msg.fields.routingKey, '[' + msg.properties.type + '] consume message nacked - ' + JSON.stringify(error))
      }
      break
    case 'btc':
      try {
        // get the agg_state object for the hash_id
        let aggStateRow = await storageClient.getAggStateObjectByHashIdAsync(messageObj.hash_id)
        if (!aggStateRow) throw new Error(new Date().toISOString() + ' no matching agg_state data found')
        // get the cal_state object for the agg_id
        let calStateRow = await storageClient.getCalStateObjectByAggIdAsync(aggStateRow.agg_id)
        if (!calStateRow) throw new Error(new Date().toISOString() + ' no matching cal_state data found')
        // get the anchorAgg_state object for the cal_id
        let anchorAggStateRow = await storageClient.getAnchorAggStateObjectByCalIdAsync(calStateRow.cal_id)
        if (!anchorAggStateRow) throw new Error(new Date().toISOString() + ' no matching anchor_agg_state data found')
        // get the btctx_state object for the anchor_agg_id
        let btcTxStateRow = await storageClient.getBTCTxStateObjectByAnchorAggIdAsync(anchorAggStateRow.anchor_agg_id)
        if (!btcTxStateRow) throw new Error(new Date().toISOString() + ' no matching btctx_state data found')
        // get the btcthead_state object for the btctx_id
        let btcHeadStateRow = await storageClient.getBTCHeadStateObjectByBTCTxIdAsync(btcTxStateRow.btctx_id)
        if (!btcHeadStateRow) throw new Error(new Date().toISOString() + ' no matching btchead_state data found')

        let dataOutObj = {}
        dataOutObj.type = 'btc'
        dataOutObj.hash_id = aggStateRow.hash_id
        dataOutObj.hash = aggStateRow.hash
        dataOutObj.agg_state = JSON.parse(aggStateRow.agg_state)
        dataOutObj.cal_state = JSON.parse(calStateRow.cal_state)
        dataOutObj.anchor_agg_state = JSON.parse(anchorAggStateRow.anchor_agg_state)
        dataOutObj.btctx_state = JSON.parse(btcTxStateRow.btctx_state)
        dataOutObj.btchead_state = JSON.parse(btcHeadStateRow.btchead_state)

        // Publish a proof data object for consumption by the proof generation service
        amqpChannel.sendToQueue(env.RMQ_WORK_OUT_GEN_QUEUE, Buffer.from(JSON.stringify(dataOutObj)), { persistent: true, type: 'btc' },
          async (err, ok) => {
            if (err !== null) {
              // An error as occurred publishing a message
              console.error(env.RMQ_WORK_OUT_GEN_QUEUE, '[btc] publish message nacked')
              throw new Error(err)
            } else {
              // New message has been published
              console.log(env.RMQ_WORK_OUT_GEN_QUEUE, '[btc] publish message acked')
              // logs the btc proof event
              await storageClient.logBtcEventForHashIdAsync(aggStateRow.hash_id)
              // Proof ready message has been consumed, ack consumption of original message
              amqpChannel.ack(msg)
              console.log(msg.fields.routingKey, '[' + msg.properties.type + '] consume message acked')
            }
          })
      } catch (error) {
        console.error('error consuming proof ready message', error)
        // An error as occurred consuming a message, nack consumption of original message
        amqpChannel.nack(msg)
        console.error(msg.fields.routingKey, '[' + msg.properties.type + '] consume message nacked - ' + JSON.stringify(error))
      }
      break
    default:
      // This is an unknown proof ready type
      console.error('Unknown proof ready type', messageObj.type)
  }
}

/**
* Prunes proof state data and hash tracker logs
* All hashb data that is logged as complete will be removed from all relevant tables
* This is required to be run regularly in order to keep the proof state database from growing too large
*
*/
async function PruneStateDataAsync () {
  try {
    // remove all rows from agg_states that have been processed and from which proofs have been generated
    let rowCount = await storageClient.deleteProcessedHashesFromAggStatesAsync()
    console.log(`Pruned agg_states - ${rowCount} row(s) deleted`)
    // remove all rows from hash_tracker_logs for the hashes that have been processed and from which proofs have been generated
    rowCount = await storageClient.deleteHashTrackerLogEntriesAsync()
    console.log(`Pruned hash_tracker_logs - ${rowCount} row(s) deleted`)
    // remove all rows from cal_states whose agg_states children have all been deleted
    rowCount = await storageClient.deleteCalStatesWithNoRemainingAggStatesAsync()
    console.log(`Pruned cal_states - ${rowCount} row(s) deleted`)
    // remove all rows from anchor_agg_states whose cal_states children have all been deleted
    rowCount = await storageClient.deleteAnchorAggStatesWithNoRemainingCalStatesAsync()
    console.log(`Pruned anchor_agg_states - ${rowCount} row(s) deleted`)
    // remove all rows from btctx_states whose anchor_agg_states children have all been deleted
    rowCount = await storageClient.deleteBtcTxStatesWithNoRemainingAnchorAggStatesAsync()
    console.log(`Pruned btctx_states - ${rowCount} row(s) deleted`)
    // remove all rows from btchead_states whose btctx_states children have all been deleted
    rowCount = await storageClient.deleteBtcHeadStatesWithNoRemainingBtcTxStatesAsync()
    console.log(`Pruned btcheadstates - ${rowCount} row(s) deleted`)
    console.log('Pruning complete')
  } catch (error) {
    console.error('error with pruning', error)
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
      case 'aggregator':
        // Consumes a state message from the Aggregator service
        // Stores state information and logs event in hash tracker
        ConsumeAggregationMessageAsync(msg)
        break
      case 'cal':
        // Consumes a calendar state message from the Calendar service
        // Stores state information and publishes proof ready messages bound for the proof state service
        ConsumeCalendarMessageAsync(msg)
        break
      case 'anchor_agg':
        // Consumes a anchor aggregation state message from the Calendar service
        // Stores state information for anchor agregation events
        ConsumeAnchorAggMessageAsync(msg)
        break
      case 'btctx':
        // Consumes a btctx state message from the Calendar service
        // Stores state information for btctx events
        ConsumeBtcTxMessageAsync(msg)
        break
      case 'btcmon':
        // Consumes a btcmon state message from the Calendar service
        // Stores state information for btcmon events
        ConsumeBtcMonMessageAsync(msg)
        break
      case 'state':
        // Consumes a proof ready message from the proof state service
        // Retrieves all proof state data for a given hash, publishes message bound for the proof generator service, and logs event in hash tracker
        ConsumeProofReadyMessageAsync(msg)
        break
      default:
        // This is an unknown state type
        console.error('Unknown state type', msg.properties.type)
    }
  }
}

/**
 * Opens a storage connection
 **/
async function openStorageConnectionAsync () {
  let dbConnected = false
  while (!dbConnected) {
    try {
      await await storageClient.openConnectionAsync()
      console.log('Sequelize connection established')
      dbConnected = true
    } catch (error) {
      // catch errors when attempting to establish connection
      console.error('Cannot establish Sequelize connection. Attempting in 5 seconds...')
      await utils.sleep(5000)
    }
  }
}
/**
 * Opens an AMPQ connection and channel
 * Retry logic is included to handle losses of connection
 *
 * @param {string} connectionString - The connection string for the RabbitMQ instance, an AMQP URI
 */
async function openRMQConnectionAsync (connectionString) {
  let rmqConnected = false
  while (!rmqConnected) {
    try {
      // connect to rabbitmq server
      let conn = await amqp.connect(connectionString)
      // create communication channel
      let chan = await conn.createConfirmChannel()
      // the connection and channel have been established
      chan.assertQueue(env.RMQ_WORK_IN_STATE_QUEUE, { durable: true })
      chan.assertQueue(env.RMQ_WORK_OUT_STATE_QUEUE, { durable: true })
      chan.assertQueue(env.RMQ_WORK_OUT_GEN_QUEUE, { durable: true })
      chan.prefetch(env.RMQ_PREFETCH_COUNT_STATE)
      amqpChannel = chan
      // Continuously load the HASHES from RMQ with hash objects to process
      chan.consume(env.RMQ_WORK_IN_STATE_QUEUE, (msg) => {
        processMessage(msg)
      })
      // if the channel closes for any reason, attempt to reconnect
      conn.on('close', async () => {
        console.error('Connection to RMQ closed.  Reconnecting in 5 seconds...')
        amqpChannel = null
        await utils.sleep(5000)
        await openRMQConnectionAsync(connectionString)
      })
      console.log('RabbitMQ connection established')
      rmqConnected = true
    } catch (error) {
      // catch errors when attempting to establish connection
      console.error('Cannot establish RabbitMQ connection. Attempting in 5 seconds...')
      await utils.sleep(5000)
    }
  }
}

function startIntervals () {
  setInterval(PruneStateDataAsync, env.PRUNE_FREQUENCY_MINUTES * 60 * 1000)
}

// process all steps need to start the application
async function start () {
  if (env.NODE_ENV === 'test') return
  try {
    // init DB
    await openStorageConnectionAsync()
    // init RabbitMQ
    await openRMQConnectionAsync(env.RABBITMQ_CONNECT_URI)
    // Init intervals
    startIntervals()
    console.log('startup completed successfully')
  } catch (err) {
    console.error(`An error has occurred on startup: ${err}`)
    process.exit(1)
  }
}

// get the whole show started
start()
