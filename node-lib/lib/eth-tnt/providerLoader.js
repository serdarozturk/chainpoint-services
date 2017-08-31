const env = require('../parse-env.js')('eth-tnt-provider')
let Wallet = require('ethereumjs-wallet')
let Web3 = require('web3')
let ProviderEngine = require('web3-provider-engine')
let WalletSubprovider = require('web3-provider-engine/subproviders/wallet.js')
let Web3Subprovider = require('web3-provider-engine/subproviders/web3.js')
let fs = require('fs')

module.exports = (nodeUri) => {
  // Load the env var to figure out which node to connect to
  if (!nodeUri) {
    console.error('ETH_PROVIDER_URI environment variable not set.  Exiting...')
    process.exit(-1)
  }

  // Check to see if a wallet is being used
  if (env.ETH_WALLET_PATH && env.ETH_WALLET_PATH !== '') {
    // Check to verify the WALLET_PASSWORD env variable is set
    if (!env.ETH_WALLET_PASSWORD || env.ETH_WALLET_PASSWORD === '') {
      console.error('ETH_WALLET_PASSWORD environment variable is not set.  See README. Exiting...')
      process.exit(-1)
    }

    // Check to verify the wallet.json file is present
    if (!fs.existsSync(env.ETH_WALLET_PATH)) {
      console.error('Wallet JSON file was not found.  See README. Exiting...')
      process.exit(-1)
    }

    console.log('Using provider ' + nodeUri + ' with wallet ' + env.ETH_WALLET_PATH)

    // Read the wallet in from the file
    let wallet = Wallet.fromV3(fs.readFileSync(env.ETH_WALLET_PATH, 'utf8'), env.ETH_WALLET_PASSWORD)

    var engine = new ProviderEngine()
    engine.addProvider(new WalletSubprovider(wallet, {}))
    engine.addProvider(new Web3Subprovider(new Web3.providers.HttpProvider(nodeUri)))
    engine.start() // Required by the provider engine.
    return engine
  }

  console.log('Using provider without wallet: ' + nodeUri)
  return new Web3.providers.HttpProvider(nodeUri)
}
