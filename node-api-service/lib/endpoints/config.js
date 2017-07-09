const env = require('../parse-env.js')('api')

/**
 * GET /config handler
 *
 * Returns a configuration information object
 */
function getConfigInfoV1 (req, res, next) {
  res.send({
    chainpoint_stack_id: env.CHAINPOINT_STACK_ID,
    chainpoint_base_uri: env.CHAINPOINT_BASE_URI,
    anchor_btc: env.ANCHOR_BTC === 'enabled',
    anchor_eth: env.ANCHOR_ETH === 'enabled',
    proof_expire_minutes: env.PROOF_EXPIRE_MINUTES,
    get_proofs_max_rest: env.GET_PROOFS_MAX_REST,
    get_proofs_max_ws: env.GET_PROOFS_MAX_WS,
    post_hashes_max: env.POST_HASHES_MAX,
    post_verify_proofs_max: env.POST_VERIFY_PROOFS_MAX,
    get_calendar_blocks_max: env.GET_CALENDAR_BLOCKS_MAX
  })
  return next()
}

module.exports = {
  getConfigInfoV1: getConfigInfoV1
}
