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

const calendarBlock = require('../models/CalendarBlock.js')
const auditChallenge = require('../models/AuditChallenge.js')
const restify = require('restify')

let CalendarBlock = calendarBlock.CalendarBlock
let AuditChallenge = auditChallenge.AuditChallenge

function getCorePublicKeyList () {
  return {
    '09b0ec65fa25': 'Q88brO55SfkY5S0Rbnyh3gh1s6izAj9v4BSWVF1dce0=',
    'fcbc2ba6c808': 'UWJSQwBjlvlkSirJcdFKP4zGQIq1mfrk7j0xV0CZ9yI='
  }
}

// get the first entry in the ETH_TNT_LISTEN_ADDRS CSV to publicize
let coreEthAddress = env.ETH_TNT_LISTEN_ADDRS.split(',')[0]

/**
 * GET /config handler
 *
 * Returns a configuration information object
 */
async function getConfigInfoV1Async (req, res, next) {
  let result
  try {
    let topCoreBlock = await CalendarBlock.findOne({ attributes: ['id'], order: [['id', 'DESC']] })
    if (!topCoreBlock) throw new Error('no blocks found on calendar')

    let mostRecentChallenge = await AuditChallenge.findOne({ order: [['time', 'DESC']] })

    let mostRecentChallengeText
    if (mostRecentChallenge) {
      mostRecentChallengeText = `${mostRecentChallenge.time}:${mostRecentChallenge.minBlock}:${mostRecentChallenge.maxBlock}:${mostRecentChallenge.nonce}`
    }

    result = {
      chainpoint_core_base_uri: env.CHAINPOINT_CORE_BASE_URI,
      anchor_btc: env.ANCHOR_BTC,
      anchor_eth: env.ANCHOR_ETH,
      proof_expire_minutes: env.PROOF_EXPIRE_MINUTES,
      get_proofs_max_rest: env.GET_PROOFS_MAX_REST,
      get_proofs_max_ws: env.GET_PROOFS_MAX_WS,
      post_verify_proofs_max: env.POST_VERIFY_PROOFS_MAX,
      get_calendar_blocks_max: env.GET_CALENDAR_BLOCKS_MAX,
      time: new Date().toISOString(),
      public_keys: getCorePublicKeyList(),
      calendar: {
        height: parseInt(topCoreBlock.id),
        audit_challenge: mostRecentChallengeText || undefined
      },
      core_eth_address: coreEthAddress
    }
  } catch (error) {
    console.error(`Could not generate config object: ${error.message}`)
    return next(new restify.InternalServerError('server error'))
  }

  res.send(result)
  return next()
}

module.exports = {
  getConfigInfoV1Async: getConfigInfoV1Async,
  setCalendarBlock: (calBlock) => { CalendarBlock = calBlock },
  setAuditChallenge: (auditChallenge) => { AuditChallenge = auditChallenge }
}
