var ProviderEngine = require('web3-provider-engine')
var WalletSubprovider = require('web3-provider-engine/subproviders/wallet.js')
var Web3Subprovider = require('web3-provider-engine/subproviders/web3.js')
var Web3 = require('web3')

module.exports = (wallet) => {
  // Load the env var to figure out which node to connect to
  let nodeUri = process.env.PROVIDER_URI
  if (!nodeUri) {
    console.error('PROVIDER_URI environment variable not set.  Exiting...')
    process.exit(-1)
  }

  console.log('Using provider: ' + nodeUri)

  var engine = new ProviderEngine()
  engine.addProvider(new WalletSubprovider(wallet, {}))
  engine.addProvider(new Web3Subprovider(new Web3.providers.HttpProvider(nodeUri)))

  // Only start this if we are running in testnet - otherwise it holds the main thread open
  if(process.env.NETWORK == 'roptsten'){
    engine.start() // Required by the provider engine.
  }
  return engine
}
