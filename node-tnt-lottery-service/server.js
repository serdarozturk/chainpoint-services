// load all environment variables into env object
const env = require('./lib/parse-env.js')('tnt-lottery')

const utils = require('./lib/utils')
const amqp = require('amqplib')
const rp = require('request-promise-native')

// The channel used for all amqp communication
// This value is set once the connection has been established
var amqpChannel = null

// Randomly select and deliver tokens to a lottery winner from the list
// of registered nodes that meet the minimum audit and tnt balance
// eligability requirements for receiving TNT awards
async function performLotteryAsync () {
  // find all audit qualifying registered Nodes
  // randomly select lottery winner from qualifying Nodes
  // if the selected Node does not have a sufficient minimum TNT balance,
  // remove the Node from the qualifying list and make new random selection
  // award TNT to ETH address for winning Node
  // award TNT to Core operator, if applicable
  // send lottery result message to Calendar
}

// This initalizes all the JS intervals that fire all aggregator events
function startIntervals () {
  console.log('starting intervals')

  // PERIODIC TIMERS

  setInterval(() => performLotteryAsync(), env.LOTTERY_FREQUENCY_SECONDS * 1000)
}

/**
 * Opens an AMPQ connection and channel
 * Retry logic is included to handle losses of connection
 *
 * @param {string} connectionString - The connection URI for the RabbitMQ instance
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
      chan.assertQueue(env.RMQ_WORK_OUT_CAL_QUEUE, { durable: true })
      // set 'amqpChannel' so that publishers have access to the channel
      amqpChannel = chan
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

// process all steps need to start the application
async function start () {
  if (env.NODE_ENV === 'test') return
  try {
    // init rabbitMQ
    await openRMQConnectionAsync(env.RABBITMQ_CONNECT_URI)
    // init interval functions
    startIntervals()
    console.log('startup completed successfully')
  } catch (err) {
    console.error(`An error has occurred on startup: ${err}`)
    process.exit(1)
  }
}

// get the whole show started
start()
