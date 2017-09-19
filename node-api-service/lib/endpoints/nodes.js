/* Copyright (C) 2017 Tierion
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

const crypto = require('crypto')
const restify = require('restify')
const _ = require('lodash')
const moment = require('moment')
var validUrl = require('valid-url')
const registeredNode = require('../models/RegisteredNode.js')
const nodeAuditLog = require('../models/NodeAuditLog.js')
const url = require('url')

let registeredNodeSequelize = registeredNode.sequelize
let RegisteredNode = registeredNode.RegisteredNode
let nodeAuditLogSequelize = nodeAuditLog.sequelize
let NodeAuditLog = nodeAuditLog.NodeAuditLog

// The number of results to return when responding to a random nodes query
const RANDOM_NODES_RESULT_LIMIT = 5

// The number of recent audit log entries to return
const AUDIT_HISTORY_COUNT = 10 // at current rate, 5 hours worth

// validate eth address is well formed
let isEthereumAddr = (address) => {
  return /^0x[0-9a-fA-F]{40}$/i.test(address)
}

let isHMAC = (hmac) => {
  return /^[0-9a-fA-F]{64}$/i.test(hmac)
}

/**
 * GET /nodes/:tnt_addr retrieve handler
 *
 * Retrieve an existing registered Node
 */
async function getNodeByTNTAddrV1Async (req, res, next) {
  if (!req.params.hasOwnProperty('tnt_addr')) {
    return next(new restify.InvalidArgumentError('invalid JSON body, missing tnt_addr'))
  }

  if (_.isEmpty(req.params.tnt_addr)) {
    return next(new restify.InvalidArgumentError('invalid JSON body, empty tnt_addr'))
  }

  let lowerCasedTntAddrParam
  if (!isEthereumAddr(req.params.tnt_addr)) {
    return next(new restify.InvalidArgumentError('invalid JSON body, malformed tnt_addr'))
  } else {
    lowerCasedTntAddrParam = req.params.tnt_addr.toLowerCase()
  }

  /*

  This endpoint with be publicly accessible, reserving hmac code here if we decide to restore auth

  if (!req.params.hasOwnProperty('hmac')) {
    return next(new restify.InvalidArgumentError('invalid JSON body, missing hmac'))
  }

  if (_.isEmpty(req.params.hmac)) {
    return next(new restify.InvalidArgumentError('invalid JSON body, empty hmac'))
  }

  if (!isHMAC(req.params.hmac)) {
    return next(new restify.InvalidArgumentError('invalid JSON body, invalid hmac'))
  }
  */

  let regNode
  let recentAudits
  try {
    regNode = await RegisteredNode.findOne({ where: { tntAddr: lowerCasedTntAddrParam } })
    if (!regNode) {
      res.status(404)
      res.noCache()
      res.send({code: 'NotFoundError', message: ''})
      return next()
    }
  } catch (error) {
    console.error(`Could not retrieve RegisteredNode: ${error.message}`)
    return next(new restify.InternalServerError('server error'))
  }

  try {
    recentAudits = await NodeAuditLog.findAll({ where: { tntAddr: lowerCasedTntAddrParam }, attributes: ['auditAt', 'publicIPPass', 'timePass', 'calStatePass', 'minCreditsPass'], order: [['auditAt', 'DESC']], limit: AUDIT_HISTORY_COUNT })
  } catch (error) {
    console.error(`Could not retrieve NodeAuditLog items: ${error.message}`)
    return next(new restify.InternalServerError('server error'))
  }

  let result = {
    recent_audits: recentAudits.map((audit) => {
      return {
        time: parseInt(audit.auditAt),
        public_ip_test: audit.publicIPPass,
        time_test: audit.timePass,
        calendar_state_test: audit.calStatePass,
        minimum_credits_test: audit.minCreditsPass
      }
    })
  }

  res.cache('public', {maxAge: 900})
  res.send(result)
  return next()
}

/**
 * GET /nodes retrieve handler
 *
 * Retrieve a random subset of registered and healthy Nodes
 */
async function getNodesRandomV1Async (req, res, next) {
  // get a list of random healthy Nodes
  let regNodesTableName = RegisteredNode.getTableName()
  let nodeAuditLogTableName = NodeAuditLog.getTableName()
  let thirtyMinutesAgo = Date.now() - 30 * 60 * 1000
  let sqlQuery = `SELECT rn.public_uri FROM ${regNodesTableName} rn 
                  WHERE rn.public_uri IS NOT NULL AND rn.tnt_addr IN (
                    SELECT DISTINCT al.tnt_addr FROM ${nodeAuditLogTableName} al 
                    WHERE al.audit_at >= ${thirtyMinutesAgo} AND al.public_ip_pass = TRUE AND al.time_pass = TRUE AND al.cal_state_pass = TRUE and al.min_credits_pass = true
                  )
                  ORDER BY RANDOM() LIMIT ${RANDOM_NODES_RESULT_LIMIT}`
  let rndNodes = await registeredNodeSequelize.query(sqlQuery, { type: registeredNodeSequelize.QueryTypes.SELECT })

  // build well formatted result array
  rndNodes = rndNodes.map((rndNode) => {
    return {
      public_uri: rndNode.public_uri
    }
  })

  res.cache('public', {maxAge: 60})

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

  let lowerCasedTntAddrParam
  if (!isEthereumAddr(req.params.tnt_addr)) {
    return next(new restify.InvalidArgumentError('invalid JSON body, malformed tnt_addr'))
  } else {
    lowerCasedTntAddrParam = req.params.tnt_addr.toLowerCase()
  }

  // a POST without public_uri prop represents a non-public Node
  if (req.params.hasOwnProperty('public_uri') && _.isEmpty(req.params.public_uri)) {
    return next(new restify.InvalidArgumentError('invalid JSON body, invalid empty public_uri, remove if non-public IP'))
  }

  let lowerCasedPublicUri = req.params.public_uri ? req.params.public_uri.toLowerCase() : null
  // if an public_uri is provided, it must be valid
  if (lowerCasedPublicUri && !validUrl.isWebUri(lowerCasedPublicUri)) {
    return next(new restify.InvalidArgumentError('invalid JSON body, invalid public_uri'))
  }

  let parsedPublicUri = url.parse(lowerCasedPublicUri)
  // disallow localhost
  if (parsedPublicUri.hostname === 'localhost') {
    return next(new restify.InvalidArgumentError('localhost not allowed in CHAINPOINT_NODE_PUBLIC_URI'))
  }
  // disallow 0.0.0.0
  if (parsedPublicUri.hostname === '0.0.0.0') {
    return next(new restify.InvalidArgumentError('0.0.0.0 not allowed in CHAINPOINT_NODE_PUBLIC_URI'))
  }

  try {
    let count = await RegisteredNode.count({ where: { tntAddr: lowerCasedTntAddrParam } })
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
      tntAddr: lowerCasedTntAddrParam,
      publicUri: lowerCasedPublicUri,
      hmacKey: randHMACKey
    })
  } catch (error) {
    console.error(`Could not create RegisteredNode for ${lowerCasedTntAddrParam} at ${lowerCasedPublicUri}: ${error.message}`)
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

  let lowerCasedTntAddrParam
  if (!isEthereumAddr(req.params.tnt_addr)) {
    return next(new restify.InvalidArgumentError('invalid JSON body, malformed tnt_addr'))
  } else {
    lowerCasedTntAddrParam = req.params.tnt_addr.toLowerCase()
  }

  let lowerCasedPublicUri = req.params.public_uri ? req.params.public_uri.toLowerCase() : null
  // if an public_uri is provided, it must be valid
  if (lowerCasedPublicUri && !_.isEmpty(lowerCasedPublicUri)) {
    if (!validUrl.isWebUri(lowerCasedPublicUri)) {
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
    let regNode = await RegisteredNode.find({ where: { tntAddr: lowerCasedTntAddrParam } })
    if (!regNode) {
      res.status(404)
      res.noCache()
      res.send({code: 'NotFoundError', message: ''})
      return next()
    }

    // HMAC-SHA256(hmac-key, TNT_ADDRESS|IP|YYYYMMDDHHMM)
    // Forces Nodes to be within 1 min of Core to generate a valid HMAC
    let hash = crypto.createHmac('sha256', regNode.hmacKey)
    let formattedDate = moment().utc().format('YYYYMMDDHHmm')
    // use req.params.tnt_addr below instead of lowerCasedTntAddrParam to preserve
    // formatting submitted from Node and used in that Node's calculation
    // use req.params.public_uri below instead of lowerCasedPublicUri to preserve
    // formatting submitted from Node and used in that Node's calculation
    let hmacTxt = [req.params.tnt_addr, req.params.public_uri, formattedDate].join('')
    let calculatedHMAC = hash.update(hmacTxt).digest('hex')

    if (!_.isEqual(calculatedHMAC, req.params.hmac)) {
      return next(new restify.InvalidArgumentError('incorrect hmac'))
    }

    if (lowerCasedPublicUri == null || _.isEmpty(lowerCasedPublicUri)) {
      regNode.publicUri = null
    } else {
      regNode.publicUri = lowerCasedPublicUri
    }

    await regNode.save()
  } catch (error) {
    console.error(`Could not update RegisteredNode: ${error.message}`)
    return next(new restify.InternalServerError('server error'))
  }

  res.send({
    tnt_addr: lowerCasedTntAddrParam,
    public_uri: req.params.public_uri
  })
  return next()
}

module.exports = {
  getRegisteredNodeSequelize: () => { return registeredNodeSequelize },
  getNodeAuditLogSequelize: () => { return nodeAuditLogSequelize },
  getNodesRandomV1Async: getNodesRandomV1Async,
  getNodeByTNTAddrV1Async: getNodeByTNTAddrV1Async,
  postNodeV1Async: postNodeV1Async,
  putNodeV1Async: putNodeV1Async,
  setNodesRegisteredNode: (regNode) => { RegisteredNode = regNode },
  setNodesNodeAuditLog: (nodeAuditLog) => { NodeAuditLog = nodeAuditLog }
}
