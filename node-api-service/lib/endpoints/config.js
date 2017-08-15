const env = require('../parse-env.js')('api')

const calendarBlock = require('../models/CalendarBlock.js')
const restify = require('restify')

// The redis connection used for all redis communication
// This value is set once the connection has been established
let redis = null

let CalendarBlock = calendarBlock.CalendarBlock

function getCorePublicKeyList () {
  return {
    '09b0ec65fa25': 'Q88brO55SfkY5S0Rbnyh3gh1s6izAj9v4BSWVF1dce0=',
    'fcbc2ba6c808': 'UWJSQwBjlvlkSirJcdFKP4zGQIq1mfrk7j0xV0CZ9yI='
  }
}

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

    let latestChallengeKey = await redis.getAsync(`calendar_audit_challenge:latest_key`)
    let latestChallenge = await redis.getAsync(latestChallengeKey)

    // the challenge value contains the solution in the last segment, remove it before adding to teh response
    if (latestChallenge) {
      let challengeSegments = latestChallenge.split(':')
      challengeSegments.pop()
      latestChallenge = challengeSegments.join(':')
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
        audit_challenge: latestChallenge || undefined
      }
    }
  } catch (error) {
    console.error(`could not generate config object : ${error}`)
    return next(new restify.InternalServerError('server error'))
  }

  res.send(result)
  return next()
}

module.exports = {
  getConfigInfoV1Async: getConfigInfoV1Async,
  setRedis: (redisClient) => { redis = redisClient },
  setCalendarBlock: (calBlock) => { CalendarBlock = calBlock }
}
