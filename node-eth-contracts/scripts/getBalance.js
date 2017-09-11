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

// load all environment variables into env object
const env = require('../lib/parse-env.js')('eth-contracts')

const loadProvider = require('../loaders/providerLoader.js')
const loadToken = require('../loaders/tokenLoader.js')
const TokenOps = require('../tokenOps.js')

// Verify the correct command line options are passed in
if (process.argv.length !== 3) {
  console.error('Invalid number of params.')
  console.log('Usage: node getBalance.js <addr_to_check>')
  process.exit(-1)
}

// Load the provider, token contract, and create the TokenOps class
let web3Provider = loadProvider(env.ETH_PROVIDER_URI)
loadToken(web3Provider, env.ETH_TNT_TOKEN_ADDR).then((tokenContract) => {
  let ops = new TokenOps(tokenContract)

  // Trigger the get balance on the specified address
  ops.getBalance(process.argv[2], (error, res) => {
    // Check for error
    if (error) {
      console.log(error)
      process.exit(-1)
    }

    console.log('\n')
    console.log('Token balance of ' + process.argv[2] + ' is ' + res)
    console.log('\n')

    process.exit()
  })
})
