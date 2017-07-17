const env = require('../parse-env.js')('api')
const utils = require('../utils.js')

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
function getConfigInfoV1 (req, res, next) {
  res.send({
    chainpoint_stack_id: env.CHAINPOINT_STACK_ID,
    chainpoint_base_uri: env.CHAINPOINT_BASE_URI,
    anchor_btc: env.ANCHOR_BTC,
    anchor_eth: env.ANCHOR_ETH,
    proof_expire_minutes: env.PROOF_EXPIRE_MINUTES,
    get_proofs_max_rest: env.GET_PROOFS_MAX_REST,
    get_proofs_max_ws: env.GET_PROOFS_MAX_WS,
    post_hashes_max: env.POST_HASHES_MAX,
    post_verify_proofs_max: env.POST_VERIFY_PROOFS_MAX,
    get_calendar_blocks_max: env.GET_CALENDAR_BLOCKS_MAX,
    time: utils.formatDateISO8601NoMs(new Date()),
    public_keys: getCorePublicKeyList()
  })
  return next()
}

module.exports = {
  getConfigInfoV1: getConfigInfoV1
}
