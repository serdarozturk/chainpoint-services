var Web3 = require('web3')

/*
 * This function will load the BCAP token ABI from the build directory and initialize
 * it so that it can be used to interact with the blockchain. It will use env variable
 * set for the address of the contract on the blockchain.
*/
module.exports = (provider, tokenAddr) => {
  // Create the provider
  let web3 = new Web3(provider)

  // Set the default "from" account to the accounts
  web3.eth.defaultAccount = web3.accounts[0]

  // First check to see the Token Address is set as an env var
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
