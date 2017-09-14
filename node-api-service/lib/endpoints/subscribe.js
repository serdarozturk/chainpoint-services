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

const env = require('../parse-env.js')('api')
const async = require('async')
const uuidValidate = require('uuid-validate')
const uuidTime = require('uuid-time')

// The redis connection used for all redis communication
// This value is set once the connection has been established
let redis = null

function subscribeForProofs (APIServiceInstanceId, ws, wsConnectionId, hashIds) {
  // build an array of hash_ids, ignoring any hash_ids above the GET_PROOFS_MAX_WS limit
  let hashIdResults = hashIds.split(',').slice(0, env.GET_PROOFS_MAX_WS).map((hashId) => {
    return { hash_id: hashId.trim(), proof: null }
  })

  async.eachLimit(hashIdResults, 50, (hashIdResult, callback) => {
    // validate id param is proper UUIDv1
    let isValidUUID = uuidValidate(hashIdResult.hash_id, 1)
    // validate uuid time is in in valid range
    let uuidEpoch = parseInt(uuidTime.v1(hashIdResult.hash_id))
    var nowEpoch = new Date().getTime()
    let uuidDiff = nowEpoch - uuidEpoch
    let maxDiff = env.PROOF_EXPIRE_MINUTES * 60 * 1000
    let uuidValidTime = (uuidDiff <= maxDiff)
    if (isValidUUID && uuidValidTime) {
      createProofSubscription(APIServiceInstanceId, wsConnectionId, hashIdResult.hash_id, (err, proofBase64) => {
        if (err) return callback(err)
        if (proofBase64 !== null) {
          let proofResponse = {
            hash_id: hashIdResult.hash_id,
            proof: proofBase64
          }
          ws.send(JSON.stringify(proofResponse))
        }
        callback(null)
      })
    }
  }, (err) => {
    if (err) console.error(err)
  })
}

function createProofSubscription (APIServiceInstanceId, wsConnectionId, hashId, callback) {
  async.waterfall([
    (wfCallback) => {
      // create redis entry for hash subscription, storing the instance ID and ws connection id
      // The id's reference the request's origin, and are used to target the response to the correct instance and connection
      // Preface the sub key with 'sub:' so as not to conflict with the proof storage, which uses the plain hashId as the key already
      let key = 'sub:' + hashId
      redis.hmset(key, ['api_id', APIServiceInstanceId, 'cx_id', wsConnectionId], (err, res) => {
        if (err) return wfCallback(err)
        return wfCallback(null, key)
      })
    },
    (key, wfCallback) => {
      // set the subscription to expire after 24 hours have passed
      redis.expire(key, 24 * 60 * 60, (err, res) => {
        if (err) return wfCallback(err)
        return wfCallback(null)
      })
    },
    (wfCallback) => {
      // look up proof for given hashId and return if it exists
      redis.get(hashId, (err, proofBase64) => {
        if (err) return wfCallback(err)
        // proofBase64 will either be a proof Base64 string or null
        return wfCallback(null, proofBase64)
      })
    }
  ],
    (err, proofBase64) => {
      if (err) return callback(err)
      return callback(null, proofBase64)
    })
}

module.exports = {
  subscribeForProofs: subscribeForProofs,
  setRedis: (redisClient) => { redis = redisClient }
}
