/* Copyright 2017 Tierion
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*     http://www.apache.org/licenses/LICENSE-2.0
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

var Web3 = require('web3')
const contract = require('truffle-contract')
/*
 * This function will load the TierionNetworkToken token ABI from the build directory and initialize
 * it so that it can be used to interact with the blockchain. It will use env variable
 * set for the address of the contract on the blockchain.
*/
module.exports = async (provider, tokenAddr) => {
  // Create the provider
  console.log('Creating web3')
  let web3 = new Web3(provider)

  // Load the token json obj
  console.log('loading TierionNetworkToken token')
  let tokenDef = require('../../contracts/TierionNetworkToken.json')

  // If the token addr is specified in the environment var, use that as highest priority
  if (tokenAddr && tokenAddr !== '') {
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
    console.error('TierionNetworkToken Token ERC20 Contract Address is not found deployed or set as env var (ETH_TNT_TOKEN_ADDR).  Exiting...')
    process.exit(-1)
  }

  // Dumb workaround for bug - https://github.com/ethereum/web3.js/issues/925
  console.log('Using TNT Token contract at ', deployedToken.address)
  let tokenABI = tokenDef.abi
  let tokenDefinition = web3.eth.contract(tokenABI)
  return tokenDefinition.at(deployedToken.address)
}
