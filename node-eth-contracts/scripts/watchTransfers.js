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
if (process.argv.length !== 4) {
  console.error('Invalid number of params.')
  console.log('Usage: node watchTransfers.js <target_addr_to_watch> <start_block>')
  process.exit(-1)
}

// Load the provider, token contract, and create the TokenOps class
let web3Provider = loadProvider(env.ETH_PROVIDER_URI)
loadToken(web3Provider, env.ETH_TNT_TOKEN_ADDR).then((tokenContract) => {
  let ops = new TokenOps(tokenContract)

  console.log('Listening for transfers to ' + process.argv[2] + ' starting from block ' + parseInt(process.argv[3]) + '\n')

  // Start listening
  ops.watchForTransfers(process.argv[2], parseInt(process.argv[3]), (error, params) => {
    // Check for error
    if (error) {
      console.error(error)
      process.exit(-1)
    }

    // For demo, we will just print out the event
    console.log('Transfer occurred on Block ' + params.blockNumber + ' From: ' + params.args._from + ' To: ' + params.args._to + ' AMT: ' + params.args._value)
  })
})
