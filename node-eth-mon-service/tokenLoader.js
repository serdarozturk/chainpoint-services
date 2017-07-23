var Web3 = require('web3')
var loadWallet = require('./walletLoader.js')
var loadProvider = require('./providerLoader.js')

/*
 * This function will load the BCAP token ABI from the build directory and initialize
 * it so that it can be used to interact with the blockchain. It will use env variable
 * set for the address of the contract on the blockchain.
*/
module.exports = () => {
  // Read the wallet in from the file and create the provider
  let wallet = loadWallet()
  let provider = loadProvider(wallet)
  let web3 = new Web3(provider)

  // Set the default "from" account to the loaded wallet
  web3.eth.defaultAccount = '0x' + wallet.getAddress().toString('hex')

  // First check to see the Token Address is set as an env var
  let tokenAddr = process.env.BCAP_TOKEN_ADDR
  if (!tokenAddr) {
    console.error('BCAP Token ERC20 Contract Address is not set as env var (BCAP_TOKEN_ADDR).  Exiting...')
    process.exit(-1)
  }

  // Load the ABI for the contract and initialize a contract interface
  let tokenABI = require('./build/contracts/BCAPTestToken.json').abi
  let tokenDefinition = web3.eth.contract(tokenABI)

  // Set the actual instance from the address on the blockchain, so we can communicate with it.
  return tokenDefinition.at(tokenAddr)
}
