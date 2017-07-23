var Wallet = require('ethereumjs-wallet')

/*
 * This function will load the wallet file and return back the wallet object.
 * This requires the WALLET_PASSWORD env var to be set.
*/
module.exports = () => {
  var fs = require('fs')

  // Check to verify the WALLET_PASSWORD env variable is set
  if (!process.env.WALLET_PASSWORD) {
    console.error('WALLET_PASSWORD environment variable is not set.  See README. Exiting...')
    process.exit(-1)
  }

  // Check to verify the wallet.json file is present
  const WALLET_FILE = './wallet.json'
  if (!fs.existsSync(WALLET_FILE)) {
    console.error('wallet.json file was not found.  See README. Exiting...')
    process.exit(-1)
  }

  // Read the wallet in from the file
  return Wallet.fromV3(fs.readFileSync(WALLET_FILE, 'utf8'), process.env.WALLET_PASSWORD)
}
