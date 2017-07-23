/*
 * This script will generate a new 12 word mnemonic and save a wallet file "wallet.json" to the local file system.
 * The wallet.json file will contain the first wallet in the standard HD path of the HD wallet.
 * This wallet.json file will be used by various scripts to sign outgoing transactions.
*/

// Generate the mnemonic
let bip39 = require('bip39')
let mnemonic = bip39.generateMnemonic()
console.log('\n\nHere is the mnemonic that can regenerate the HD wallet at a later point:')
console.log(mnemonic)
console.log('\n')

// From the mnemonic create the HD wallet
let hdkey = require('ethereumjs-wallet/hdkey')
let hdwallet = hdkey.fromMasterSeed(bip39.mnemonicToSeed(mnemonic))

// Generate the first wallet from the HD wallet
let walletPath = "m/44'/60'/0'/0/"
let wallet = hdwallet.derivePath(walletPath + '0').getWallet()

// Print out the address of the wallet
var address = '0x' + wallet.getAddress().toString('hex')
console.log('The address of the wallet is: ' + address + '\n')

// Prompt for a password to encrypt the wallet file with
let prompt = require('password-prompt')
prompt('Enter a password to encrypt the wallet file: ').then((password) => {
  // Convert the wallet to v3 json string and save to file
  let file = require('fs')
  file.writeFileSync('./wallet.json', wallet.toV3String(password))

  console.log('Success: wallet.json file has been saved.\n')
})
