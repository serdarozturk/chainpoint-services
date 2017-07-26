const env = require('./lib/parse-env.js')('eth-mon')

/**
 * This export is used by various truffle scripts to determine how to connect to different ETH networks.
 * The development network will be used by default if not specified.
 */
module.exports = {
  networks: {
    development: {
      host: env.ETH_PROVIDER_HOST,
      port: env.ETH_PROVIDER_PORT,
      network_id: '*' // Match any network id
    }
  }
}
