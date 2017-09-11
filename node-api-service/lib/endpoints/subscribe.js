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
    let uuidEpoch = uuidTime.v1(hashIdResult.hash_id)
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
