/* Copyright 2017 Tierion
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*     http://www.apache.org/licenses/LICENSE-2.0
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

// load all environment variables into env object
const env = require('./lib/parse-env.js')('audit')

const rp = require('request-promise-native')
const registeredNode = require('./lib/models/RegisteredNode.js')
const nodeAuditLog = require('./lib/models/NodeAuditLog.js')
const utils = require('./lib/utils.js')
const calendarBlock = require('./lib/models/CalendarBlock.js')
const auditChallenge = require('./lib/models/AuditChallenge.js')
const crypto = require('crypto')
const rnd = require('random-number-csprng')
const MerkleTools = require('merkle-tools')
const cnsl = require('consul')
const _ = require('lodash')

// TweetNaCl.js
// see: http://ed25519.cr.yp.to
// see: https://github.com/dchest/tweetnacl-js#signatures
const nacl = require('tweetnacl')
nacl.util = require('tweetnacl-util')

// the fuzz factor for anchor interval meant to give each core instance a random chance of being first
const maxFuzzyMS = 1000

let consul = cnsl({ host: env.CONSUL_HOST, port: env.CONSUL_PORT })
console.log('Consul connection established')

// The merkle tools object for building trees and generating proof paths
const merkleTools = new MerkleTools()

// pull in variables defined in shared database models
let regNodeSequelize = registeredNode.sequelize
let RegisteredNode = registeredNode.RegisteredNode
let nodeAuditSequelize = nodeAuditLog.sequelize
let NodeAuditLog = nodeAuditLog.NodeAuditLog
let calBlockSequelize = calendarBlock.sequelize
let CalendarBlock = calendarBlock.CalendarBlock
let auditChallengeSequelize = auditChallenge.sequelize
let AuditChallenge = auditChallenge.AuditChallenge

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
// Value must be greater than 2, or results may be unpredictable
const GEN_AUDIT_CHALLENGE_MIN = 60 // 1 hour

// The acceptable time difference between Node and Core for a timestamp to be considered valid, in milliseconds
const ACCEPTABLE_DELTA_MS = 5000 // 5 seconds

// The maximum age of a node audit response to accept
const MAX_CHALLENGE_AGE_MINUTES = 75

let challengeLockOpts = {
  key: env.CHALLENGE_LOCK_KEY,
  lockwaittime: '60s',
  lockwaittimeout: '60s',
  lockretrytime: '100ms',
  session: {
    behavior: 'delete',
    checks: ['serfHealth'],
    lockdelay: '1ms',
    name: 'challenge-lock',
    ttl: '30s'
  }
}

let challengeLock = consul.lock(_.merge({}, challengeLockOpts, { value: 'challenge' }))

let auditLockOpts = {
  key: env.AUDIT_LOCK_KEY,
  lockwaittime: '60s',
  lockwaittimeout: '60s',
  lockretrytime: '100ms',
  session: {
    behavior: 'delete',
    checks: ['serfHealth'],
    lockdelay: '1ms',
    name: 'audit-lock',
    ttl: '30s'
  }
}

let auditLock = consul.lock(_.merge({}, auditLockOpts, { value: 'audit' }))

function registerLockEvents (lock, lockName, acquireFunction) {
  lock.on('acquire', () => {
    console.log(`${lockName} acquired`)
    acquireFunction()
  })

  lock.on('error', (err) => {
    console.error(`${lockName} error - ${err}`)
  })

  lock.on('release', () => {
    console.log(`${lockName} release`)
  })
}

// LOCK HANDLERS : challenge
registerLockEvents(challengeLock, 'challengeLock', async () => {
  try {
    // check if the last challenge is at least GEN_AUDIT_CHALLENGE_MIN - oneMinuteMS old
    // if not, return and release lock
    let mostRecentChallenge = await AuditChallenge.findOne({ order: [['time', 'DESC']] })
    if (mostRecentChallenge) {
      let oneMinuteMS = 60000
      let currentMS = Date.now()
      let ageMS = currentMS - mostRecentChallenge.time
      let lastChallengeTooRecent = (ageMS < (GEN_AUDIT_CHALLENGE_MIN * 60 * 1000 - oneMinuteMS))
      if (lastChallengeTooRecent) {
        let ageSec = Math.round(ageMS / 1000)
        console.log(`No work: ${GEN_AUDIT_CHALLENGE_MIN} minutes must elapse between each new audit challenge. The last one was generated ${ageSec} seconds ago.`)
        return
      }
    }
    await generateAuditChallengeAsync()
  } catch (error) {
    console.error(`Unable to generate audit challenge: ${error.message}`)
  } finally {
    // always release lock
    challengeLock.release()
  }
})

// LOCK HANDLERS : challenge
registerLockEvents(auditLock, 'auditLock', async () => {
  try {
    await auditNodesAsync()
  } catch (error) {
    console.error(`Unable to perform node audits: ${error.message}`)
  } finally {
    // always release lock
    auditLock.release()
  }
})

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
          tntAddr: nodesReadyForAudit[x].tntAddr.toLowerCase(),
          publicUri: null,
          auditAt: coreAuditTimestamp,
          publicIPPass: false,
          nodeMSDelta: null,
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
      timeout: 2500,
      resolveWithFullResponse: true
    }

    let coreAuditTimestamp = Date.now()
    let nodeResponse
    try {
      nodeResponse = await rp(options)
      coreAuditTimestamp = Date.now()
    } catch (error) {
      if (error.statusCode) {
        console.log(`NodeAudit: GET failed with status code ${error.statusCode} for ${nodesReadyForAudit[x].publicUri}: ${error.message}`)
      } else {
        console.log(`NodeAudit: GET failed for ${nodesReadyForAudit[x].publicUri}: ${error.message}`)
      }
      try {
        await NodeAuditLog.create({
          tntAddr: nodesReadyForAudit[x].tntAddr.toLowerCase(),
          publicUri: nodesReadyForAudit[x].publicUri,
          auditAt: coreAuditTimestamp,
          publicIPPass: false,
          nodeMSDelta: null,
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
      console.log(`NodeAudit: GET failed with missing audit response for ${nodesReadyForAudit[x].publicUri}`)
      try {
        await NodeAuditLog.create({
          tntAddr: nodesReadyForAudit[x].tntAddr.toLowerCase(),
          publicUri: nodesReadyForAudit[x].publicUri,
          auditAt: coreAuditTimestamp,
          publicIPPass: false,
          nodeMSDelta: null,
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
      console.log(`NodeAudit: GET failed with missing time for ${nodesReadyForAudit[x].publicUri}`)
      try {
        await NodeAuditLog.create({
          tntAddr: nodesReadyForAudit[x].tntAddr.toLowerCase(),
          publicUri: nodesReadyForAudit[x].publicUri,
          auditAt: coreAuditTimestamp,
          publicIPPass: false,
          nodeMSDelta: null,
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
      let nodeAuditResponse = nodeResponse.body.calendar.audit_response.split(':')
      let nodeAuditResponseTimestamp = nodeAuditResponse[0]
      let nodeAuditResponseSolution = nodeAuditResponse[1]
      let nodeAuditTimestamp = Date.parse(nodeResponse.body.time)

      // make sure the audit reponse is newer than MAX_CHALLENGE_AGE_MINUTES
      let coreAuditChallenge
      let minTimestamp = coreAuditTimestamp - (MAX_CHALLENGE_AGE_MINUTES * 60 * 1000)
      if (parseInt(nodeAuditResponseTimestamp) >= minTimestamp) {
        coreAuditChallenge = await AuditChallenge.findOne({ where: { time: nodeAuditResponseTimestamp } })
      }

      // We've gotten this far, so at least auditedPublicIPAt has passed
      let publicIPPass = true

      // check if the Node timestamp is withing the acceptable range
      let timePass = false
      let nodeMSDelta = (nodeAuditTimestamp - coreAuditTimestamp)
      if (Math.abs(nodeMSDelta) <= ACCEPTABLE_DELTA_MS) {
        timePass = true
      }

      // check if the Node challenge solution is correct
      let calStatePass = false
      if (coreAuditChallenge) {
        let coreChallengeSolution = nacl.util.decodeUTF8(coreAuditChallenge.solution)
        nodeAuditResponseSolution = nacl.util.decodeUTF8(nodeAuditResponseSolution)

        if (nacl.verify(nodeAuditResponseSolution, coreChallengeSolution)) {
          calStatePass = true
        }
      } else {
        console.error(`NodeAudit: No audit challenge record found for time ${nodeAuditResponseTimestamp}`)
      }

      // update the Node audit results in RegisteredNode
      try {
        await NodeAuditLog.create({
          tntAddr: nodesReadyForAudit[x].tntAddr.toLowerCase(),
          publicUri: nodesReadyForAudit[x].publicUri,
          auditAt: coreAuditTimestamp,
          publicIPPass: publicIPPass,
          nodeMSDelta: nodeMSDelta,
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

// Generate a new audit challenge for the Nodes. Audit challenges should be refreshed hourly.
// Audit challenges include a timestamp, minimum block height, maximum block height, and a nonce
async function generateAuditChallengeAsync () {
  try {
    let challengeTime = Date.now()
    let currentBlockHeight
    let topBlock = await CalendarBlock.findOne({ attributes: ['id'], order: [['id', 'DESC']] })
    if (topBlock) {
      currentBlockHeight = parseInt(topBlock.id, 10)
    } else {
      console.error('Cannot generate challenge, no genesis block found.')
      return
    }
    // calulcate min and max values with special exception for low block count
    let challengeMaxBlockHeight = currentBlockHeight > 2000 ? currentBlockHeight - 1000 : currentBlockHeight
    let randomNum = await rnd(10, 1000)
    let challengeMinBlockHeight = challengeMaxBlockHeight - randomNum
    if (challengeMinBlockHeight < 0) challengeMinBlockHeight = 0
    let challengeNonce = crypto.randomBytes(32).toString('hex')

    let challengeSolution = await calculateChallengeSolutionAsync(challengeMinBlockHeight, challengeMaxBlockHeight, challengeNonce)

    let newChallenge = await AuditChallenge.create({
      time: challengeTime,
      minBlock: challengeMinBlockHeight,
      maxBlock: challengeMaxBlockHeight,
      nonce: challengeNonce,
      solution: challengeSolution
    })
    let auditChallenge = `${newChallenge.time}:${newChallenge.minBlock}:${newChallenge.maxBlock}:${newChallenge.nonce}:${newChallenge.solution}`
    console.log(`New challenge generated: ${auditChallenge}`)
  } catch (error) {
    console.error((`Could not generate audit challenge: ${error.message}`))
  }
}

async function calculateChallengeSolutionAsync (min, max, nonce) {
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

  // calculate the merkle root, the solution to the challenge
  let challengeSolution = merkleTools.getMerkleRoot().toString('hex')

  return challengeSolution
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
      await auditChallengeSequelize.sync({ logging: false })
      console.log('Sequelize connection established')
      dbConnected = true
    } catch (error) {
      // catch errors when attempting to establish connection
      console.error('Cannot establish Sequelize connection. Attempting in 5 seconds...')
      await utils.sleep(5000)
    }
  }
}

async function acquireChallengeLockWithFuzzyDelayAsync () {
  let randomFuzzyMS = await rnd(0, maxFuzzyMS)
  setTimeout(() => {
    try {
      challengeLock.acquire()
    } catch (error) {
      console.error('challengeLock.acquire(): caught err: ', error.message)
    }
  }, randomFuzzyMS)
}

async function acquireAuditLockWithFuzzyDelayAsync () {
  let randomFuzzyMS = await rnd(0, maxFuzzyMS)
  setTimeout(() => {
    try {
      auditLock.acquire()
    } catch (error) {
      console.error('auditLock.acquire(): caught err: ', error.message)
    }
  }, randomFuzzyMS)
}
async function startIntervalsAsync () {
  await acquireChallengeLockWithFuzzyDelayAsync()
  setInterval(async () => await acquireChallengeLockWithFuzzyDelayAsync(), GEN_AUDIT_CHALLENGE_MIN * 60 * 1000)

  await acquireAuditLockWithFuzzyDelayAsync()
  setInterval(async () => await acquireAuditLockWithFuzzyDelayAsync(), AUDIT_NODES_INTERVAL_MS)
}

// process all steps need to start the application
async function start () {
  if (env.NODE_ENV === 'test') return
  try {
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
