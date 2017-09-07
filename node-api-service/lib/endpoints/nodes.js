const crypto = require('crypto')
const restify = require('restify')
const _ = require('lodash')
const moment = require('moment')
var validUrl = require('valid-url')
const registeredNode = require('../models/RegisteredNode.js')
const nodeAuditLog = require('../models/NodeAuditLog.js')

let registeredNodeSequelize = registeredNode.sequelize
let RegisteredNode = registeredNode.RegisteredNode
let nodeAuditLogSequelize = nodeAuditLog.sequelize
let NodeAuditLog = nodeAuditLog.NodeAuditLog

// The number of results to return when responding to a random nodes query
const RANDOM_NODES_RESULT_LIMIT = 5

// validate eth address is well formed
let isEthereumAddr = (address) => {
  return /^0x[0-9a-fA-F]{40}$/i.test(address)
}

let isHMAC = (hmac) => {
  return /^[0-9a-fA-F]{64}$/i.test(hmac)
}

/**
 * GET /nodes retreive handler
 *
 * Retrieve a random subset of registered and healthy Nodes
 */
async function getNodesRandomV1Async (req, res, next) {
  // get a list of random healthy Nodes
  let regNodesTableName = RegisteredNode.getTableName()
  let nodeAuditLogTableName = NodeAuditLog.getTableName()
  let thirtyMinutesAgo = Date.now() - 30 * 60 * 1000
  let sqlQuery = `SELECT rn.tnt_addr, rn.public_uri, rn.last_audit_at FROM ${regNodesTableName} rn 
                  WHERE rn.public_uri IS NOT NULL AND rn.tnt_addr IN (
                    SELECT al.tnt_addr FROM ${nodeAuditLogTableName} al 
                    WHERE al.audit_at >= ${thirtyMinutesAgo} AND al.public_ip_pass = TRUE AND al.time_pass = TRUE AND al.cal_state_pass = TRUE
                  )
                  ORDER BY RANDOM() LIMIT ${RANDOM_NODES_RESULT_LIMIT}`
  let rndNodes = await registeredNodeSequelize.query(sqlQuery, { type: registeredNodeSequelize.QueryTypes.SELECT })

  // build well formatted result array
  rndNodes = rndNodes.map((rndNode) => {
    return {
      tnt_addr: rndNode.tnt_addr,
      public_uri: rndNode.public_uri,
      last_audit_at: parseInt(rndNode.last_audit_at)
    }
  })

  // randomize results order, limit, and send
  res.send(rndNodes)
  return next()
}

/**
 * POST /node create handler
 *
 * Create a new registered Node
 */
async function postNodeV1Async (req, res, next) {
  if (req.contentType() !== 'application/json') {
    return next(new restify.InvalidArgumentError('invalid content type'))
  }

  if (!req.params.hasOwnProperty('tnt_addr')) {
    return next(new restify.InvalidArgumentError('invalid JSON body, missing tnt_addr'))
  }

  if (_.isEmpty(req.params.tnt_addr)) {
    return next(new restify.InvalidArgumentError('invalid JSON body, empty tnt_addr'))
  }

  if (!isEthereumAddr(req.params.tnt_addr)) {
    return next(new restify.InvalidArgumentError('invalid JSON body, malformed tnt_addr'))
  }

  // a POST without public_uri prop represents a non-public Node
  if (req.params.hasOwnProperty('public_uri') && _.isEmpty(req.params.public_uri)) {
    return next(new restify.InvalidArgumentError('invalid JSON body, invalid empty public_uri, remove if non-public IP'))
  }

  // if an public_uri is provided, it must be valid
  if (req.params.public_uri && !validUrl.isWebUri(req.params.public_uri)) {
    return next(new restify.InvalidArgumentError('invalid JSON body, invalid public_uri'))
  }

  try {
    let count = await RegisteredNode.count({ where: { tntAddr: req.params.tnt_addr } })
    if (count >= 1) {
      return next(new restify.ConflictError('tnt_addr address already exists'))
    }
  } catch (error) {
    console.error(`Unable to count registered Nodes: ${error.message}`)
    return next(new restify.InternalServerError('server error'))
  }

  let randHMACKey = crypto.randomBytes(32).toString('hex')

  let newNode
  try {
    newNode = await RegisteredNode.create({
      tntAddr: req.params.tnt_addr,
      publicUri: req.params.public_uri,
      hmacKey: randHMACKey
    })
  } catch (error) {
    console.error(`Could not create RegisteredNode: ${error.message}`)
    return next(new restify.InternalServerError('server error'))
  }

  res.send({
    tnt_addr: newNode.tntAddr,
    public_uri: newNode.publicUri,
    hmac_key: newNode.hmacKey
  })
  return next()
}

/**
 * PUT /node/:tnt_addr update handler
 *
 * Updates an existing registered Node
 */
async function putNodeV1Async (req, res, next) {
  if (req.contentType() !== 'application/json') {
    return next(new restify.InvalidArgumentError('invalid content type'))
  }

  if (!req.params.hasOwnProperty('tnt_addr')) {
    return next(new restify.InvalidArgumentError('invalid JSON body, missing tnt_addr'))
  }

  if (_.isEmpty(req.params.tnt_addr)) {
    return next(new restify.InvalidArgumentError('invalid JSON body, empty tnt_addr'))
  }

  if (!isEthereumAddr(req.params.tnt_addr)) {
    return next(new restify.InvalidArgumentError('invalid JSON body, malformed tnt_addr'))
  }

  // if an public_uri is provided, it must be valid
  if (req.params.hasOwnProperty('public_uri') && !_.isEmpty(req.params.public_uri)) {
    if (!validUrl.isWebUri(req.params.public_uri)) {
      return next(new restify.InvalidArgumentError('invalid JSON body, invalid public_uri'))
    }
  }

  if (!req.params.hasOwnProperty('hmac')) {
    return next(new restify.InvalidArgumentError('invalid JSON body, missing hmac'))
  }

  if (_.isEmpty(req.params.hmac)) {
    return next(new restify.InvalidArgumentError('invalid JSON body, empty hmac'))
  }

  if (!isHMAC(req.params.hmac)) {
    return next(new restify.InvalidArgumentError('invalid JSON body, invalid hmac'))
  }

  try {
    let regNode = await RegisteredNode.find({ where: { tntAddr: req.params.tnt_addr } })
    if (!regNode) {
      return next(new restify.ResourceNotFoundError('not found'))
    }

    // HMAC-SHA256(hmac-key, TNT_ADDRESS|IP|YYYYMMDDHHMM)
    // Forces Nodes to be within 1 min of Core to generate a valid HMAC
    let hash = crypto.createHmac('sha256', regNode.hmacKey)
    let formattedDate = moment().utc().format('YYYYMMDDHHmm')
    let hmacTxt = [req.params.tnt_addr, req.params.public_uri, formattedDate].join('')
    let calculatedHMAC = hash.update(hmacTxt).digest('hex')

    if (!_.isEqual(calculatedHMAC, req.params.hmac)) {
      return next(new restify.InvalidArgumentError('incorrect hmac'))
    }

    if (!req.params.hasOwnProperty('public_uri') || _.isEmpty(req.params.public_uri)) {
      regNode.publicUri = null
    } else {
      regNode.publicUri = req.params.public_uri
    }

    await regNode.save()
  } catch (error) {
    console.error(`Could not update RegisteredNode: ${error.message}`)
    return next(new restify.InternalServerError('server error'))
  }

  res.send({
    tnt_addr: req.params.tnt_addr,
    public_uri: req.params.public_uri
  })
  return next()
}

module.exports = {
  getRegisteredNodeSequelize: () => { return registeredNodeSequelize },
  getNodeAuditLogSequelize: () => { return nodeAuditLogSequelize },
  getNodesRandomV1Async: getNodesRandomV1Async,
  postNodeV1Async: postNodeV1Async,
  putNodeV1Async: putNodeV1Async,
  setNodesRegisteredNode: (regNode) => { RegisteredNode = regNode },
  setNodesNodeAuditLog: (nodeAuditLog) => { NodeAuditLog = nodeAuditLog }
}
