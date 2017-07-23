var ProviderEngine = require('web3-provider-engine')
var WalletSubprovider = require('web3-provider-engine/subproviders/wallet.js')
var Web3Subprovider = require('web3-provider-engine/subproviders/web3.js')
var Web3 = require('web3')

module.exports = (nodeUri, wallet) => {
  // Load the env var to figure out which node to connect to
  if (!nodeUri) {
    console.error('ETH_PROVIDER_URI environment variable not set.  Exiting...')
    process.exit(-1)
  }

  console.log('Using provider: ' + nodeUri)

  // For development against testrpc, just use the default
  if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'staging') {
    return new Web3.providers.HttpProvider(nodeUri)
  }

  var engine = new ProviderEngine()
  engine.addProvider(new WalletSubprovider(wallet, {}))
  engine.addProvider(new Web3Subprovider(new Web3.providers.HttpProvider(nodeUri)))

  // Only start this if we are running against actual node - otherwise it holds the main thread open
  engine.start() // Required by the provider engine.

  return engine
}
