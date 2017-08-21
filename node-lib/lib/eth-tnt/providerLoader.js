var Web3 = require('web3')

module.exports = (nodeUri, wallet) => {
  // Load the env var to figure out which node to connect to
  if (!nodeUri) {
    console.error('ETH_PROVIDER_URI environment variable not set.  Exiting...')
    process.exit(-1)
  }

  console.log('Using provider: ' + nodeUri)
  return new Web3.providers.HttpProvider(nodeUri)
}
