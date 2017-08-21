require('dotenv').config()
const loadProvider = require('../loaders/providerLoader.js')
const loadToken = require('../loaders/tokenLoader.js')
const TokenOps = require('../tokenOps.js')

// Verify the correct command line options are passed in
if (process.argv.length !== 4) {
  console.error('Invalid number of params.')
  console.log('Usage: node transferTokens.js <send_to_addr> <amt_in_base_units>')
  process.exit(-1)
}

// Load the provider, token contract, and create the TokenOps class
let web3Provider = loadProvider(process.env.ETH_PROVIDER_URI)
loadToken(web3Provider, process.env.ETH_TNT_TOKEN_ADDR).then((tokenContract) => {
  let ops = new TokenOps(tokenContract)

  let toAddr = process.argv[2]
  let amt = parseInt(process.argv[3])

  console.log('Sending ' + amt + ' TNT to: ' + toAddr)

  ops.sendTokens(toAddr, amt, (error, res) => {
    // Check for error
    if (error) {
      console.log(error)
      process.exit(-1)
    }

    console.log('Tokens have been transferred')
    console.log('Transaction: ' + res)
    process.exit()
  })
})
