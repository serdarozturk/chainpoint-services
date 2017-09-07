// load all environment variables into env object
const env = require('./lib/parse-env.js')('audit')

const rp = require('request-promise-native')
const registeredNode = require('./lib/models/RegisteredNode.js')
const nodeAuditLog = require('./lib/models/NodeAuditLog.js')
const utils = require('./lib/utils.js')
const r = require('redis')
const calendarBlock = require('./lib/models/CalendarBlock.js')
const crypto = require('crypto')
const rnd = require('random-number-csprng')
const MerkleTools = require('merkle-tools')
const bluebird = require('bluebird')

// TweetNaCl.js
// see: http://ed25519.cr.yp.to
// see: https://github.com/dchest/tweetnacl-js#signatures
const nacl = require('tweetnacl')
nacl.util = require('tweetnacl-util')

// The redis connection used for all redis communication
// This value is set once the connection has been established
let redis = null

// The merkle tools object for building trees and generating proof paths
const merkleTools = new MerkleTools()

// pull in variables defined in shared database models
let regNodeSequelize = registeredNode.sequelize
let RegisteredNode = registeredNode.RegisteredNode
let nodeAuditSequelize = nodeAuditLog.sequelize
let NodeAuditLog = nodeAuditLog.NodeAuditLog
let calBlockSequelize = calendarBlock.sequelize
let CalendarBlock = calendarBlock.CalendarBlock

// See : https://github.com/ranm8/requestify
// Setup requestify and its caching layer.
const requestify = require('requestify')
const coreCacheTransporters = requestify.coreCacheTransporters
requestify.cacheTransporter(coreCacheTransporters.inMemory())

// The frequency of the Node audit checks
const AUDIT_NODES_INTERVAL_MS = 1000 * 60 // 1 minute

// The age of the last successful audit before a new audit should be performed for a Node
const AUDIT_NEEDED_AGE_MS = 1000 * 60 * 30 // 30 minutes

// The frequency in which audit challenges are generated, in minutes
const GEN_AUDIT_CHALLENGE_MIN = 60 // 1 hour

// The lifespan of an audit challenge in Redis
const CHALLENGE_EXPIRE_MINUTES = 75

// The acceptable time difference between Node and Core for a timestamp to be considered valid, in milliseconds
const ACCEPTABLE_DELTA_MS = 1000 // 1 second

// Retrieve all registered Nodes with public_uris for auditing.
async function auditNodesAsync () {
  let nodesReadyForAudit = []
  try {
    let lastAuditCutoff = Date.now() - AUDIT_NEEDED_AGE_MS
    nodesReadyForAudit = await RegisteredNode.findAll(
      {
        where: {
          $or: [
            { lastAuditAt: null },
            { lastAuditAt: { $lte: lastAuditCutoff } }
          ]
        }
      })

    console.log(`${nodesReadyForAudit.length} public Nodes ready for audit were found`)
  } catch (error) {
    console.error(`Could not retrieve public Node list: ${error.message}`)
  }

  // iterate through each Node, requesting an answer to the challenge
  for (let x = 0; x < nodesReadyForAudit.length; x++) {
    // if there is no public_uri set for this Node, fail all audit tests and continue to the next
    if (!nodesReadyForAudit[x].publicUri) {
      let coreAuditTimestamp = Date.now()
      try {
        await NodeAuditLog.create({
          tntAddr: nodesReadyForAudit[x].tntAddr,
          publicUri: null,
          auditAt: coreAuditTimestamp,
          publicIPPass: false,
          timePass: false,
          calStatePass: false
        })
        await RegisteredNode.update({ lastAuditAt: coreAuditTimestamp }, { where: { tntAddr: nodesReadyForAudit[x].tntAddr } })
      } catch (error) {
        console.error(`NodeAudit error: ${nodesReadyForAudit[x].tntAddr}: ${error.message} `)
      }
      continue
    }

    let options = {
      headers: [
        {
          name: 'Content-Type',
          value: 'application/json'
        }
      ],
      method: 'GET',
      uri: `${nodesReadyForAudit[x].publicUri}/config`,
      json: true,
      gzip: true,
      resolveWithFullResponse: true
    }

    let coreAuditTimestamp
    let nodeResponse
    try {
      coreAuditTimestamp = Date.now()
      nodeResponse = await rp(options)
    } catch (error) {
      console.error(`NodeAudit: GET failed with status code ${error.statusCode} for ${nodesReadyForAudit[x].publicUri}: ${error.message}`)
      try {
        await NodeAuditLog.create({
          tntAddr: nodesReadyForAudit[x].tntAddr,
          publicUri: nodesReadyForAudit[x].publicUri,
          auditAt: coreAuditTimestamp,
          publicIPPass: false,
          timePass: false,
          calStatePass: false
        })
        await RegisteredNode.update({ lastAuditAt: coreAuditTimestamp }, { where: { tntAddr: nodesReadyForAudit[x].tntAddr } })
      } catch (error) {
        console.error(`NodeAudit error: ${nodesReadyForAudit[x].tntAddr}: ${error.message} `)
      }
      continue
    }
    if (!nodeResponse.body.calendar || !nodeResponse.body.calendar.audit_response) {
      console.error(`NodeAudit: GET failed with missing audit response for ${nodesReadyForAudit[x].publicUri}`)
      try {
        await NodeAuditLog.create({
          tntAddr: nodesReadyForAudit[x].tntAddr,
          publicUri: nodesReadyForAudit[x].publicUri,
          auditAt: coreAuditTimestamp,
          publicIPPass: false,
          timePass: false,
          calStatePass: false
        })
        await RegisteredNode.update({ lastAuditAt: coreAuditTimestamp }, { where: { tntAddr: nodesReadyForAudit[x].tntAddr } })
      } catch (error) {
        console.error(`NodeAudit error: ${nodesReadyForAudit[x].tntAddr}: ${error.message} `)
      }
      continue
    }
    if (!nodeResponse.body.time) {
      console.error(`NodeAudit: GET failed with missing time for ${nodesReadyForAudit[x].publicUri}`)
      try {
        await NodeAuditLog.create({
          tntAddr: nodesReadyForAudit[x].tntAddr,
          publicUri: nodesReadyForAudit[x].publicUri,
          auditAt: coreAuditTimestamp,
          publicIPPass: false,
          timePass: false,
          calStatePass: false
        })
        await RegisteredNode.update({ lastAuditAt: coreAuditTimestamp }, { where: { tntAddr: nodesReadyForAudit[x].tntAddr } })
      } catch (error) {
        console.error(`NodeAudit error: ${nodesReadyForAudit[x].tntAddr}: ${error.message} `)
      }
      continue
    }

    try {
      let nodeAuditResponseData = nodeResponse.body.calendar.audit_response.split(':')
      let nodeAuditResponseCoreChallengeCreateTimestamp = nodeAuditResponseData[0]
      let nodeAuditResponseSolution = nodeAuditResponseData[1]
      let coreAuditChallenge = await redis.getAsync(`calendar_audit_challenge:${nodeAuditResponseCoreChallengeCreateTimestamp}`)
      let nodeAuditTimestamp = Date.parse(nodeResponse.body.time)

      // We've gotten this far, so at least auditedPublicIPAt has passed
      let publicIPPass = true

      // check if the Node timestamp is withing the acceptable range
      let timePass = false
      if (Math.abs(nodeAuditTimestamp - coreAuditTimestamp) <= ACCEPTABLE_DELTA_MS) {
        timePass = true
      }

      // check if the Node challenge solution is correct
      let calStatePass = false
      if (coreAuditChallenge) {
        let coreChallengeSegments = coreAuditChallenge.split(':')
        let coreChallengeSolution = coreChallengeSegments.pop()

        nodeAuditResponseSolution = nacl.util.decodeUTF8(nodeAuditResponseSolution)
        coreChallengeSolution = nacl.util.decodeUTF8(coreChallengeSolution)

        if (nacl.verify(nodeAuditResponseSolution, coreChallengeSolution)) {
          calStatePass = true
        }
      } else {
        console.error(`NodeAudit: No challenge data found for key 'calendar_audit_challenge:${nodeAuditResponseCoreChallengeCreateTimestamp}'`)
      }

      // update the Node audit results in RegisteredNode
      try {
        await NodeAuditLog.create({
          tntAddr: nodesReadyForAudit[x].tntAddr,
          publicUri: nodesReadyForAudit[x].publicUri,
          auditAt: coreAuditTimestamp,
          publicIPPass: publicIPPass,
          timePass: timePass,
          calStatePass: calStatePass
        })
        await RegisteredNode.update({ lastAuditAt: coreAuditTimestamp }, { where: { tntAddr: nodesReadyForAudit[x].tntAddr } })
      } catch (error) {
        throw new Error(`Could not update Node Audit results: ${error.message}`)
      }

      let results = {}
      results.auditAt = coreAuditTimestamp
      results.publicIPPass = publicIPPass
      results.timePass = timePass
      results.calStatePass = calStatePass

      console.log(`Audit complete for ${nodesReadyForAudit[x].tntAddr} at ${nodesReadyForAudit[x].publicUri}: ${JSON.stringify(results)}`)
    } catch (error) {
      console.error(`NodeAudit error: ${nodesReadyForAudit[x].tntAddr}: ${error.message} `)
    }
  }
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
    return
  }

  try {
    let time = Date.now()
    let height
    let topBlock = await CalendarBlock.findOne({ attributes: ['id'], order: [['id', 'DESC']] })
    if (topBlock) {
      height = parseInt(topBlock.id, 10)
    } else {
      console.error('Cannot generate challenge, no genesis block found. Attempting in 5 seconds...')
      setTimeout(() => {
        generateAuditChallengeAsync()
      }, 5000)
      return
    }
    // calulcate min and max values with special exception for low block count
    let max = height > 2000 ? height - 1000 : height
    let randomNum = await rnd(10, 1000)
    let min = max - randomNum
    if (min < 0) min = 0
    let nonce = crypto.randomBytes(32).toString('hex')

    let challengeAnswer = await calculateChallengeAnswerAsync(min, max, nonce)
    let auditChallenge = `${time}:${min}:${max}:${nonce}:${challengeAnswer}`
    let challengeKey = `calendar_audit_challenge:${time}`
    // store the new challenge at its own unique key
    await redis.setAsync(challengeKey, auditChallenge, 'EX', CHALLENGE_EXPIRE_MINUTES * 60)
    // keep track of the newest challenge key so /config knows what the latest to display is
    await redis.setAsync(`calendar_audit_challenge:latest_key`, challengeKey)
    console.log(`Challenge set: ${auditChallenge}`)
  } catch (error) {
    console.error((`Could not generate audit challenge: ${error.message}`))
  }
}

async function calculateChallengeAnswerAsync (min, max, nonce) {
  let blocks = await CalendarBlock.findAll({ where: { id: { $between: [min, max] } }, order: [['id', 'ASC']] })

  if (blocks.length === 0) throw new Error('No blocks returned to create challenge tree')

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
    console.error(`A redis error has ocurred: ${err}`)
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
      await regNodeSequelize.sync({ logging: false })
      await nodeAuditSequelize.sync({ logging: false })
      await calBlockSequelize.sync({ logging: false })
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
  await generateAuditChallengeAsync()
  await auditNodesAsync()
  setInterval(async () => await generateAuditChallengeAsync(), GEN_AUDIT_CHALLENGE_MIN * 60 * 1000)
  setInterval(async () => await auditNodesAsync(), AUDIT_NODES_INTERVAL_MS)
}

// process all steps need to start the application
async function start () {
  if (env.NODE_ENV === 'test') return
  try {
    // init Redis
    openRedisConnection(env.REDIS_CONNECT_URI)
    // init DB
    await openStorageConnectionAsync()
    // start main processing
    await startIntervalsAsync()
    console.log('startup completed successfully')
  } catch (error) {
    console.error(`An error has occurred on startup: ${error.message}`)
    process.exit(1)
  }
}

// get the whole show started
start()
