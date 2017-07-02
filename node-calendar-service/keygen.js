#!/usr/bin/env node

// A deterministic signing keypair generator for Ed25519 keys.
//
// Usage: Generate (offline) a VERY secure passphrase.
//
// It is recommended to use a 12 word Diceware passphrase
// for ~155 bits of entropy.
//
// See : https://www.rempe.us/diceware/#eff
//
// This sessionKeys script will use Scrypt to derive enough key material for
// eight signing keypairs. Each pair will be printed as Base64 encoded
// key bytes. Keys encoded this way are directly usable on
// the https://tweetnacl.js.org/#/sign website for testing.
//
// Given the same username ('ops@tierion.com') and passphrase
// this script can be run again to re-generate all of the keypairs
// deterministically.
//
// IMPORTANT : Store the passphrase safely!!! It is recommended to
// split this key and share it amongst several key trusted individuals.
// If this passphrase is ever compromised, all of the generated keys are
// compromised as well and must be taken out of service. If a particular
// keypair is compromised, but the master passphrase is safe, you can just
// rotate to the next keypair in line and discontinue use of the previous.

const nacl = require('tweetnacl')
nacl.util = require('tweetnacl-util')

// See : https://github.com/grempe/session-keys-js
var sessionKeys = require('session-keys')

// Omit the first two arguments (node and path)
var args = process.argv.slice(2)

if (args.length < 1) {
  console.error('Usage : ./keygen.sh "My secure passphrase in quotes"')
  process.exit(1)
}

let username = 'ops@tierion.com'
// the passphrase arg can be quoted or just a list of words
let passphrase = args.join(' ').trim()
let date = new Date()

sessionKeys.generate(username, passphrase, function (err, keys) {
  if (err) {
    console.error('sessionKeys error : ', err)
  }

  console.log()
  console.log('SIGNING KEY GENERATION')
  console.log('**************')
  console.log('generated at : ', date.toISOString())
  console.log('username : ', username)
  console.log('passphrase : ', passphrase)

  console.log()
  console.log('Signing Keys')
  console.log('--------------')
  console.log()

  keys.naclSigningKeyPairsBase64.forEach(function (keypair, index) {
    console.log('secret key ', index, ' : ', keypair.secretKey)
    console.log('public key ', index, ' : ', keypair.publicKey)
    console.log('')
  })
})
