require('dotenv').config()
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
let web3Provider = loadProvider(process.env.ETH_PROVIDER_URI)
loadToken(web3Provider, process.env.ETH_TNT_TOKEN_ADDR).then((tokenContract) => {
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
