// load all environment variables into env object
const env = require('./lib/parse-env.js')('audit')

const nodeRegistration = require('./lib/models/NodeRegistration.js')
const utils = require('./lib/utils.js')
const r = require('redis')
const calendarBlock = require('./lib/models/CalendarBlock.js')
const crypto = require('crypto')
const rnd = require('random-number-csprng')
const MerkleTools = require('merkle-tools')
const bluebird = require('bluebird')

// The redis connection used for all redis communication
// This value is set once the connection has been established
let redis = null

// The merkle tools object for building trees and generating proof paths
const merkleTools = new MerkleTools()

// pull in variables defined in shared CalendarBlock module
let sequelize = nodeRegistration.sequelize
let NodeRegistration = nodeRegistration.NodeRegistration
let CalendarBlock = calendarBlock.CalendarBlock

// See : https://github.com/ranm8/requestify
// Setup requestify and its caching layer.
const requestify = require('requestify')
const coreCacheTransporters = requestify.coreCacheTransporters
requestify.cacheTransporter(coreCacheTransporters.inMemory())

// How often to query the DB for stale nodes
const CHECK_STALE_INTERVAL_MS = 1000 * 60 // 1 min

// How old must a node's timestamp be to be considered stale
const STALE_AFTER_MS = 1000 * 60 * 60 // 1 hour

// The frequency in which audit challenges are generated, in minutes
const GEN_AUDIT_CHALLENGE_MIN = 60 // 1 hour

// The redis key where the current audit challenge is stored
const AUDIT_CHALLENGE_KEY = 'ChallengeString'

// Retrieve all registered Nodes that have out of date
// audit results. Nodes should be audited hourly.
async function getStaleAuditNodesAsync () {
  console.log('AUDITING', STALE_AFTER_MS)
}

// Generate a new audit challenge for the Nodes
// Audit challenges should be refreshed hourly.
async function generateAuditChallengeAsync () {
  if (!redis) {
    // redis has not yet been initialized, or has temporarily become unavailable
    // retry this operation in 5 seconds, the same rate redis connections attempt to reconnect
    console.error('Cannot generate challenge, no Redis connection. Attempting in 5 seconds...')
    setTimeout(() => {
      generateAuditChallengeAsync()
    }, 5000)
  } else {
    try {
      let time = Date.now()
      let height
      let topBlock = await CalendarBlock.findOne({ attributes: ['id'], order: [['id', 'DESC']] })
      if (topBlock) {
        height = parseInt(topBlock.id, 10)
      } else {
        throw new Error('no genesis block found')
      }
    // calulcate min and max values with special exception for low block count
      let max = height > 2000 ? height - 1000 : height
      let randomNum = await rnd(10, 1000)
      let min = max - randomNum
      let nonce = crypto.randomBytes(32).toString('hex')

      let challengeAnswer = await calculateChallengeAnswerAsync(min, max, nonce)
      let auditChallenge = `${time}:${min}:${max}:${nonce}:${challengeAnswer}`

      await redis.setAsync(AUDIT_CHALLENGE_KEY, auditChallenge)
      console.log(`Challenge set : ${auditChallenge}`)
    } catch (error) {
      console.error((`could not generate audit challenge : ${error}`))
    }
  }
}

async function calculateChallengeAnswerAsync (min, max, nonce) {
  let blocks = await CalendarBlock.findAll({ where: { id: { $between: [min, max] } }, order: [['id', 'ASC']] })

  merkleTools.resetTree()

  // retrieve all block hashes from blocks array
  let leaves = blocks.map((block) => {
    let blockHashBuffer = Buffer.from(block.hash, 'hex')
    return blockHashBuffer
  })
  // add the nonce to the head of the leaves array
  leaves.unshift(Buffer.from(nonce, 'hex'))

  // Add every hash in leaves to new Merkle tree
  merkleTools.addLeaves(leaves)
  merkleTools.makeTree()

  // calculate the merkle root
  let challengeRoot = merkleTools.getMerkleRoot().toString('hex')

  return challengeRoot
}

/**
 * Opens a Redis connection
 *
 * @param {string} connectionString - The connection string for the Redis instance, an Redis URI
 */
function openRedisConnection (redisURI) {
  redis = r.createClient(redisURI)
  redis.on('ready', () => {
    bluebird.promisifyAll(redis)
    console.log('Redis connection established')
  })
  redis.on('error', async (err) => {
    console.log(err)
    redis.quit()
    redis = null
    console.error('Cannot establish Redis connection. Attempting in 5 seconds...')
    await utils.sleep(5000)
    openRedisConnection(redisURI)
  })
}

/**
 * Opens a storage connection
 **/
async function openStorageConnectionAsync () {
  let dbConnected = false
  while (!dbConnected) {
    try {
      await sequelize.sync({ logging: false })
      console.log('Sequelize connection established')
      dbConnected = true
    } catch (error) {
      // catch errors when attempting to establish connection
      console.error('Cannot establish Sequelize connection. Attempting in 5 seconds...')
      await utils.sleep(5000)
    }
  }
}

async function startIntervalsAsync () {
  await getStaleAuditNodesAsync()
  await generateAuditChallengeAsync()
  setInterval(async () => await getStaleAuditNodesAsync(), CHECK_STALE_INTERVAL_MS)
  setInterval(async () => await generateAuditChallengeAsync(), GEN_AUDIT_CHALLENGE_MIN * 60 * 1000)
}

// process all steps need to start the application
async function start () {
  if (env.NODE_ENV === 'test') return
  try {
    console.log(env.REDIS_CONNECT_URI)
    // init Redis
    openRedisConnection(env.REDIS_CONNECT_URI)
    // init DB
    await openStorageConnectionAsync()
    // start main processing
    await startIntervalsAsync()
    console.log('startup completed successfully')
  } catch (err) {
    console.error(`An error has occurred on startup: ${err}`)
    process.exit(1)
  }
}

// get the whole show started
start()
