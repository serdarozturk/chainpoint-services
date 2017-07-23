require('dotenv').config()
var loadToken = require('../tokenLoader.js')
var TokenOps = require('../tokenOps.js')

// Verify the correct command line options are passed in
if (process.argv.length !== 4) {
  console.error('Invalid number of params.')
  console.log('Usage: node watchTransfers.js <target_addr_to_watch> <start_block>')
  process.exit(-1)
}

// Load the token contract and create the TokenOps class
let ops = new TokenOps(loadToken())

console.log('Listening for transfers to ' + process.argv[2] + ' starting from block ' + parseInt(process.argv[3]) + '\n')

// Start listening
ops.watchForTransfers(process.argv[2], parseInt(process.argv[3]), (error, params) => {
  // Check for error
  if (error) {
    console.error(error)
    process.exit(-1)
  }

  // Should save off block number here from latest seen event.
  // Should take any action required when event is triggered here.

  // For demo, we will just print out the event
  console.log('Trasfer occurred on Block ' + params.blockNumber + ' From: ' + params.args._from + ' To: ' + params.args._to + ' AMT: ' + params.args._value)
})
