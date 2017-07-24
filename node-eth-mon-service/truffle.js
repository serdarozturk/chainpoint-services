require('dotenv').config()
var loadWallet = require('./loaders/walletLoader.js')
var loadProvider = require('./loaders/providerLoader.js')

// Read the wallet in from the file
let wallet = loadWallet()
var address = '0x' + wallet.getAddress().toString('hex')
console.log('Using this address for source transactions on Ropsten: ' + address)

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
    },
    ropsten: {
      network_id: 3,                   // Ropsten network id
      provider: loadProvider(wallet),  // Use our custom provider
      from: address,                   // Use the source address we derived to sign transactions.
      gas: 4000000                     // Ran into some bugs related to gas... this seemed to fix it.
    }
  }
}
