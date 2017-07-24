require('dotenv').config()

/**
 * This export is used by various truffle scripts to determine how to connect to different ETH networks.
 * The development network will be used by default if not specified.
 */
module.exports = {
  networks: {
    development: {
      host: 'localhost',
      port: 8545,
      network_id: '*' // Match any network id
    }
  }
}
