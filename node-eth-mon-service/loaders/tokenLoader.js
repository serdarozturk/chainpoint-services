var Web3 = require('web3')
const contract = require('truffle-contract')
/*
 * This function will load the BCAP token ABI from the build directory and initialize
 * it so that it can be used to interact with the blockchain. It will use env variable
 * set for the address of the contract on the blockchain.
*/
module.exports = async (provider, tokenAddr) => {
  // Create the provider
  let web3 = new Web3(provider)

  // Set the default "from" account to the accounts
  web3.eth.defaultAccount = web3.eth.accounts[0]

  // Load the token json obj
  let tokenDef = require('../build/contracts/BCAPTestToken.json')

  // If the token addr is specified in the environment var, use that as highest priority
  if (tokenAddr) {
    console.log('Using token addr: ' + tokenAddr)

    // Load the ABI for the contract and initialize a contract interface
    let tokenABI = tokenDef.abi
    let tokenDefinition = web3.eth.contract(tokenABI)

    // Set the actual instance from the address on the blockchain, so we can communicate with it.
    return tokenDefinition.at(tokenAddr)
  }

  // If the env var was not set, see if the token definition has been deployed.
  const token = contract(tokenDef)
  token.setProvider(provider)
  let deployedToken = await token.deployed()

  // Didn't find it there either... bail out
  if (!deployedToken) {
    console.error('BCAP Token ERC20 Contract Address is not found deployed or set as env var (BCAP_TOKEN_ADDR).  Exiting...')
    process.exit(-1)
  }

  // Dumb workaround for bug - https://github.com/ethereum/web3.js/issues/925
  let tokenABI = tokenDef.abi
  let tokenDefinition = web3.eth.contract(tokenABI)
  return tokenDefinition.at(deployedToken.address)
}
