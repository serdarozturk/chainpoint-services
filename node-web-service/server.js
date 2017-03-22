const _ = require('lodash')
const restify = require('restify')

// Generate a v1 UUID (time-based)
// see: https://github.com/broofa/node-uuid
const uuidv1 = require('uuid/v1')

// Test if a UUID is a valid v1 UUID
// see: https://github.com/afram/is-uuid
// isUUID.v1('857b3f0a-a777-11e5-bf7f-feff819cdc9f'); // true
const isUUID = require('is-uuid')

// Parse Time value out of v1 UUID's and return
// time in ms (NOT seconds) from UNIX Epoch
// see: https://github.com/indexzero/uuid-time
var uuidTime = require('uuid-time')

// Deterministic Object Hashing
// see: https://github.com/emschwartz/objecthash-js
// see: https://github.com/benlaurie/objecthash
const objectHash = require('objecthash')

// see: https://github.com/dchest/fast-sha256-js
const sha256 = require('fast-sha256')

// TweetNaCl.js
// see: http://ed25519.cr.yp.to
// see: https://github.com/dchest/tweetnacl-js#signatures
const nacl = require('tweetnacl')
nacl.util = require('tweetnacl-util')

// Instantiate signing keypair from an external secret.
// FIXME : Externalize this secret!
const signingKeypairSeed = nacl.randomBytes(32)
const signingKeypair = nacl.sign.keyPair.fromSeed(signingKeypairSeed)

// AMQP / RabbitMQ
// const q = 'tasks'
// const open = require('amqplib').connect('amqp://127.0.0.1')
// const open = require('amqplib').connect('amqp://guest:guest@rabbitmq')

// AMQP Test Consumer
// FIXME : REMOVE THIS!
// open.then(function (conn) {
//   return conn.createChannel()
// }).then(function (ch) {
//   return ch.assertQueue(q).then(function (ok) {
//     return ch.consume(q, function (msg) {
//       if (msg !== null) {
//         console.log(msg.content.toString())
//         ch.ack(msg)
//       }
//     })
//   })
// }).catch(console.warn)

/**
 * Test if a number is Even or Odd
 *
 * @param {number} n - The number to test
 * @returns {Boolean}
 */
function isEven (n) {
  return n === parseFloat(n) && !(n % 2)
}

/**
 * Add specified minutes to a Date object
 *
 * @param {Date} date - The starting date
 * @param {number} minutes - The number of minutes to add to the date
 * @returns {Date}
 */
function addMinutes (date, minutes) {
  return new Date(date.getTime() + (minutes * 60000))
}

/**
 * Convert Date to ISO8601 string, stripping milliseconds
 * '2017-03-19T23:24:32Z'
 *
 * @param {Date} date - The date to convert
 * @returns {string} An ISO8601 formatted time string
 */
function formatDateISO8601NoMs (date) {
  return date.toISOString().slice(0, 19) + 'Z'
}

/**
 * Convert strings in an Array of hashes to lower case
 *
 * @param {string[]} hashes - An array of string hashes to convert to lower case
 * @returns {string[]} An array of lowercase hash strings
 */
function lowerCaseHashes (hashes) {
  return hashes.map(function (hash) {
    return hash.toLowerCase()
  })
}

/**
 * Generate a Key ID which is SHA256(pubKey) as a hex string.
 * This allows later lookup of that key and verification that
 * the key bytes returned hash to the same value as the keyID
 * used to retrieve it.
 *
 * @returns {string} A SHA256 hash hex string
 */
function signingKeyID () {
  return (Buffer.from(sha256(signingKeypair.publicKey))).toString('hex')
}

/**
 * Generate a Base64 encoded signature over a Byte Array
 *
 * @param {number[]} hashBytes - An array of bytes representing a hash to be signed.
 * @returns {string} A Base 64 encoded ed25519 signature
 */
function signHashBytes (hashBytes) {
  return nacl.util.encodeBase64(nacl.sign(hashBytes, signingKeypair.secretKey))
}

/**
 * Hash the provided object deterministically using 'objectHash'
 * library and sign it with ed25519 signature.
 *
 * @param {*} obj - An Object to hash and sign
 * @returns {Object} An Object with 'data_hash' and 'signature' properties
 */
function hashAndSignObject (obj) {
  let hashObjSHA256 = objectHash(obj)
  let sigObj = {}
  sigObj.type = 'ed25519',
  sigObj.key_id = signingKeyID()
  sigObj.data_hash = hashObjSHA256.toString('hex')
  sigObj.signature = signHashBytes(hashObjSHA256)
  return sigObj
}

/**
 * Accepts a hex string hash and wraps it in an Object with
 * 'data' and 'signature' properties.
 *
 * The 'data' property contains the original hash and a UUID.
 * The 'signature' property contains a hash over the 'data' object
 * and a signature on that hash.
 *
 * @param {string} hash - A hex string hash value
 * @param {Boolean} signHash - Should hashes be individually signed or not?
 * @returns {Object}
 */
function generateHashObj (hash, signHash) {
  let hashObj = {}
  hashObj.id = uuidv1()
  hashObj.hash = hash

  let resp = {}
  resp.data = hashObj

  if (signHash === true) {
    resp.signature = hashAndSignObject(hashObj)
  }

  return resp
}

/**
 * Generate the values for the 'meta' property in a POST /hashes response.
 *
 * Returns an Object with metadata about a POST /hashes request
 * including a 'timestamp', hints for estimated time to completion
 * for various operations, and info about the signing key used.
 *
 * @param {Object[]} hashes - An array of hash objects to sign
 * @param {Boolean} signMeta - Should the meta contain a signature over all hashes or not?
 * @returns {Object}
 */
function generatePostHashesResponseMetadata (hashes, signMeta) {
  let metaDataObj = {}
  let timestamp = new Date()
  metaDataObj.timestamp = formatDateISO8601NoMs(timestamp)

  metaDataObj.processing_hints = {
    cal: formatDateISO8601NoMs(addMinutes(timestamp, 1)),
    eth: formatDateISO8601NoMs(addMinutes(timestamp, 11)),
    btc: formatDateISO8601NoMs(addMinutes(timestamp, 61))
  }

  if (signMeta === true) {
    metaDataObj.signature = hashAndSignObject(hashes)
  }

  return metaDataObj
}

/**
 * Converts an array of hash strings to a object suitable to
 * return to HTTP clients.
 *
 * @param {string[]} hashes - An array of string hashes to process
 * @param {Boolean} signMeta - Should the meta contain a signature over all hashes and metadata or not?
 * @param {Boolean} signHash - Should hashes be individually signed or not?
 * @returns {Object} An Object with 'meta' and 'hashes' properties
 */
function generatePostHashesResponse (hashes, signMeta, signHash) {
  let lcHashes = lowerCaseHashes(hashes)
  let hashObjects = lcHashes.map(function (hash) {
    return generateHashObj(hash, signHash)
  })

  return {
    meta: generatePostHashesResponseMetadata(hashObjects, signMeta),
    hashes: hashObjects
  }
}

/**
 * POST /hashes handler
 *
 * Expects a JSON body with the form:
 *   {"hashes": ["hash1", "hash2", "hashN"]}
 *
 * The `hashes` key must reference a JSON Array
 * of strings representing each hash to anchor.
 *
 * Each hash must be:
 * - in Hexadecimal form [a-fA-F0-9]
 * - minimum 40 chars long (e.g. 20 byte SHA1)
 * - maximum 128 chars long (e.g. 64 byte SHA512)
 * - an even length string
 */
function postHashesV1 (req, res, next) {
  // validate content-type sent was 'application/json'
  if (!req.contentType() === 'application/json') {
    return next(new restify.InvalidArgumentError('invalid content type'))
  }

  // validate params has parse a 'hashes' key
  if (!req.params.hasOwnProperty('hashes')) {
    return next(new restify.InvalidArgumentError('invalid JSON body, missing hashes'))
  }

  // validate hashes param is an Array
  if (!_.isArray(req.params.hashes)) {
    return next(new restify.InvalidArgumentError('invalid JSON body, hashes is not an Array'))
  }

  // validate hashes param Array has at least one hash
  if (_.size(req.params.hashes) < 1) {
    return next(new restify.InvalidArgumentError('invalid JSON body, hashes Array is empty'))
  }

  // validate hashes param Array is not larger than allowed max length
  if (_.size(req.params.hashes) >= 1000) {
    return next(new restify.InvalidArgumentError('invalid JSON body, hashes Array max size exceeded'))
  }

  // validate hashes are individually well formed
  let containsValidHashes = _.every(req.params.hashes, function (hash) {
    return /^[a-fA-F0-9]{40,128}$/.test(hash) && isEven(hash.length)
  })

  if (!containsValidHashes) {
    return next(new restify.InvalidArgumentError('invalid JSON body, invalid hashes present'))
  }

  let responseObj = generatePostHashesResponse(req.params.hashes, false, false)

  // FIXME : Publish to RabbitMQ
  //
  // Publish the hash for workers to process via AMQP Publisher
  // open.then(function (conn) {
  //   return conn.createChannel()
  // }).then(function (ch) {
  //   return ch.assertQueue(q).then(function (ok) {
  //     return ch.sendToQueue(q, new Buffer('something to do'))
  //   })
  // }).catch(console.warn)

  res.send(responseObj)
  return next()
}

/**
 * GET /proofs/:id handler
 *
 * Expects a query string Hash 'id' in the form of a Version 1 UUID
 *
 * Returns a chainpoint proof for the requested Hash ID
 */
function getProofByIDV1 (req, res, next) {
  // isUUID.v1()
  // uuidTime(v1)
  res.send({proof: true})
  return next()
}

/**
 * GET / handler
 *
 * Root path handler with default message.
 *
 */
function rootV1 (req, res, next) {
  return next(new restify.ImATeapotError('This is an API endpoint. Please consult https://www.chainpoint.org'))
}

// RESTIFY
var server = restify.createServer({
  name: 'chainpoint'
})

server.use(restify.queryParser())
server.use(restify.bodyParser())

// API RESOURCES
server.post({ path: '/hashes', version: '1.0.0' }, postHashesV1)
server.post({ path: '/proofs', version: '1.0.0' }, getProofByIDV1)
server.get({ path: '/proofs/:id', version: '1.0.0' }, getProofByIDV1)
server.get({ path: '/', version: '1.0.0' }, rootV1)

// SERVER
server.listen(8080, function () {
  console.log('%s listening at %s', server.name, server.url)
})
