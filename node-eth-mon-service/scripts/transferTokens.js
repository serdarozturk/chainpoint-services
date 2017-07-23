require('dotenv').config()
var loadToken = require('../tokenLoader.js')
var TokenOps = require('../tokenOps.js')

// Verify the correct command line options are passed in
if (process.argv.length !== 4) {
  console.error('Invalid number of params.')
  console.log('Usage: node transferTokens.js <send_to_addr> <amt_in_base_units>')
  process.exit(-1)
}

// Load the token contract and create the TokenOps class
let ops = new TokenOps(loadToken())

ops.sendTokens(process.argv[2], parseInt(process.argv[3]), (error, res) => {
  // Check for error
  if (error) {
    console.log(error)
    process.exit(-1)
  }

  console.log('Tokens have been transferred')
  console.log('Transaction: ' + res)
  process.exit()
})
