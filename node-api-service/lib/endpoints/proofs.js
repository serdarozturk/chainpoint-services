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

const restify = require('restify')
const env = require('../parse-env.js')('api')
const async = require('async')
const uuidValidate = require('uuid-validate')
const uuidTime = require('uuid-time')
const chpBinary = require('chainpoint-binary')

// The redis connection used for all redis communication
// This value is set once the connection has been established
let redis = null

// The custom MIME type for JSON proof array results containing Base64 encoded proof data
const BASE64_MIME_TYPE = 'application/vnd.chainpoint.json+base64'

// The custom MIME type for JSON proof array results containing Base64 encoded proof data
const JSONLD_MIME_TYPE = 'application/vnd.chainpoint.ld+json'

/**
 * GET /proofs/:hash_id handler
 *
 * Expects a path parameter 'hash_id' in the form of a Version 1 UUID
 *
 * Returns a chainpoint proof for the requested Hash ID
 */
async function getProofsByIDV1Async (req, res, next) {
  let hashIdResults = []

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

  // prepare results array to hold proof results
  hashIdResults = hashIdResults.map((hashId) => {
    return { hash_id: hashId.trim(), proof: null }
  })
  let requestedType = req.accepts(JSONLD_MIME_TYPE) ? JSONLD_MIME_TYPE : BASE64_MIME_TYPE

  async.eachLimit(hashIdResults, 50, (hashIdResult, callback) => {
    // validate id param is proper UUIDv1
    if (!uuidValidate(hashIdResult.hash_id, 1)) return callback(null)
    // validate uuid time is in in valid range
    let uuidEpoch = parseInt(uuidTime.v1(hashIdResult.hash_id))
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
    res.cache('public', { maxAge: 5 })
    res.send(hashIdResults)
    return next()
  })
}

module.exports = {
  getProofsByIDV1Async: getProofsByIDV1Async,
  setRedis: (redisClient) => { redis = redisClient }
}
