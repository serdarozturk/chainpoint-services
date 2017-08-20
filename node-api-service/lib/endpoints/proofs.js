const restify = require('restify')
const env = require('../parse-env.js')('api')
const async = require('async')
const uuidValidate = require('uuid-validate')
const uuidTime = require('uuid-time')
const chpBinary = require('chainpoint-binary')
const crypto = require('crypto')
const nodeRegistration = require('../models/NodeRegistration.js')

// The redis connection used for all redis communication
// This value is set once the connection has been established
let redis = null

// The custom MIME type for JSON proof array results containing Base64 encoded proof data
const BASE64_MIME_TYPE = 'application/vnd.chainpoint.json+base64'

// The custom MIME type for JSON proof array results containing Base64 encoded proof data
const JSONLD_MIME_TYPE = 'application/vnd.chainpoint.ld+json'

// pull in variables defined in shared NodeRegistration module
let sequelize = nodeRegistration.sequelize
let NodeRegistration = nodeRegistration.NodeRegistration

/**
 * GET /proofs/:hash_id handler
 *
 * Expects a path parameter 'hash_id' in the form of a Version 1 UUID
 *
 * Returns a chainpoint proof for the requested Hash ID
 */
async function getProofsByIDV1Async (req, res, next) {
  let hashIdResults = []

  // validate authorization header key exists
  if (!req.headers || !req.headers.authorization) {
    return next(new restify.InvalidCredentialsError('authorization denied: missing authorization key'))
  }

  // validate authorization value is well formatted
  var authValueSegments = req.headers.authorization.split(' ')
  if (authValueSegments.length !== 2 || !/^bearer$/i.test(authValueSegments[0])) {
    return next(new restify.InvalidCredentialsError('authorization denied: bad authorization value'))
  }

  // validate tnt-address header key exists
  if (!req.headers['tnt-address']) {
    return next(new restify.InvalidCredentialsError('authorization denied: missing tnt-address key'))
  }

  // validate tnt-address value
  if (!/^0x[0-9a-f]{40}$/i.test(req.headers['tnt-address'])) {
    return next(new restify.InvalidCredentialsError('authorization denied: invalid tnt-address value'))
  }

  // check if hash_id parameter was included
  if (req.params && req.params.hash_id) {
    // a hash_id was specified in the url, so use that hash_id only

    if (!uuidValidate(req.params.hash_id, 1)) {
      return next(new restify.InvalidArgumentError('invalid request: bad hash_id'))
    }

    hashIdResults.push(req.params.hash_id)
  } else if (req.headers && req.headers.hashids) {
    // no hash_id was specified in url, read from headers.hashids
    hashIdResults = req.headers.hashids.split(',')
  }

  // ensure at least one hash_id was submitted
  if (hashIdResults.length === 0) {
    return next(new restify.InvalidArgumentError('invalid request: at least one hash id required'))
  }

  // ensure that the request count does not exceed the maximum setting
  if (hashIdResults.length > env.GET_PROOFS_MAX_REST) {
    return next(new restify.InvalidArgumentError('invalid request: too many hash ids (' + env.GET_PROOFS_MAX_REST + ' max)'))
  }

  // validate the calculated hmac
  let nodeReg = null
  try {
    nodeReg = await NodeRegistration.findOne({ where: { tntAddr: req.headers['tnt-address'] }, attributes: ['tntAddr', 'hmacKey'] })
    if (!nodeReg) {
      return next(new restify.InvalidCredentialsError('authorization denied: unknown tnt-address'))
    }
    let hash = crypto.createHmac('sha256', nodeReg.hmacKey)
    let hmac = hash.update(nodeReg.tntAddr).digest('hex')
    if (authValueSegments[1] !== hmac) {
      return next(new restify.InvalidCredentialsError('authorization denied: bad hmac value'))
    }
  } catch (error) {
    console.error(error)
    return next(new restify.InvalidCredentialsError(`authorization denied: ${error.message}`))
  }

  // prepare results array to hold proof results
  hashIdResults = hashIdResults.map((hashId) => {
    return { hash_id: hashId.trim(), proof: null }
  })
  let requestedType = req.accepts(JSONLD_MIME_TYPE) ? JSONLD_MIME_TYPE : BASE64_MIME_TYPE
  // console.log(req.accepts(requestedType))

  async.eachLimit(hashIdResults, 50, (hashIdResult, callback) => {
    // validate id param is proper UUIDv1
    if (!uuidValidate(hashIdResult.hash_id, 1)) return callback(null)
    // validate uuid time is in in valid range
    let uuidEpoch = uuidTime.v1(hashIdResult.hash_id)
    var nowEpoch = new Date().getTime()
    let uuidDiff = nowEpoch - uuidEpoch
    let maxDiff = env.PROOF_EXPIRE_MINUTES * 60 * 1000
    if (uuidDiff > maxDiff) return callback(null)
    // retrieve proof from storage
    redis.get(hashIdResult.hash_id, (err, proofBase64) => {
      if (err) return callback(null)
      if (requestedType === BASE64_MIME_TYPE) {
        hashIdResult.proof = proofBase64
        return callback(null)
      } else {
        chpBinary.binaryToObject(proofBase64, (err, proofObj) => {
          if (err) return callback(null)
          hashIdResult.proof = proofObj
          return callback(null)
        })
      }
    })
  }, (err) => {
    if (err) return next(new restify.InternalError(err))
    res.contentType = 'application/json'
    res.send(hashIdResults)
    return next()
  })
}

module.exports = {
  getSequelize: () => { return sequelize },
  getProofsByIDV1Async: getProofsByIDV1Async,
  setRedis: (redisClient) => { redis = redisClient },
  setProofsNodeRegistration: (nodeReg) => { NodeRegistration = nodeReg }
}
