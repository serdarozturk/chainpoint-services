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
// FIXME : Must instantiate signing keypair from an external secret!
const signingKeypair = nacl.sign.keyPair()

// REDIS
// see: http://redis.js.org
const r = require('redis')
const redis = r.createClient({host: 'redis'})

redis.on('error', function (err) {
  console.log('Error ' + err)
})

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

// Utility function to test if a numeric is Even or Odd
function isEven (n) {
  return n === parseFloat(n) && !(n % 2)
}

/**
 *
 * POST /hashes
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
 *
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

  // Normalize all hashes to lower case strings
  let lowerCasedHashes = req.params.hashes.map(function (hash) {
    return hash.toLowerCase()
  })

  // Run a map function over every hash to generate a UUIDv1
  // for each and a signature over the hash data.
  let hashesWithMetadata = lowerCasedHashes.map(function (hash) {
    let hashObj = {}
    let sigObj = {}

    hashObj.id = uuidv1()
    console.log('%s (string) created at %s', hashObj.id, uuidTime.v1(hashObj.id))

    // The original (lower cased) hash submitted.
    hashObj.hash = hash

    // Compute the SHA256 hash over normalized `h`
    let hashObjSHA256 = objectHash(hashObj)
    sigObj.data_hash = hashObjSHA256.toString('hex')

    // The ed25519 signature over the hash of the object we are signing
    let hashObjSHA256Signature = nacl.sign(hashObjSHA256, signingKeypair.secretKey)

    // The Base64 representation of the `ed25519` signature
    sigObj.signature = nacl.util.encodeBase64(hashObjSHA256Signature)

    // FIXME : Redis Test
    redis.set('string key', 'string val', r.print)
    redis.get('string key', r.print)

    return {data: hashObj, signature: sigObj}
  })

  // COMMON METADATA

  let metaDataObj = {}
  // Type : Currently only 'ed25519' allowed
  metaDataObj.signature_type = 'ed25519'
  // The SHA256 hash (fingerprint) of the public signing key.
  metaDataObj.signature_key_id = (Buffer.from(sha256(signingKeypair.secretKey))).toString('hex')
  // UTC Date in ISO 8601 format without milliseconds
  // e.g. '2017-03-19T23:24:32Z'
  metaDataObj.timestamp = new Date().toISOString().slice(0, 19) + 'Z'

  let respObj = {meta: metaDataObj, hashes: hashesWithMetadata}

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

  res.send(respObj)
  return next()
}

//
//
/**
 * GET /proof/:id
 * Expects a query string Hash ID in the form of a Version 1 UUID
 *
 * Returns a chainpoint proof for the given Hash ID
 */
function getProofByIDV1 (req, res, next) {
  // isUUID.v1()
  // uuidTime(v1)
  res.send({proof: true})
  return next()
}

// RESTIFY
var server = restify.createServer()
server.use(restify.queryParser())
server.use(restify.bodyParser())

// API RESOURCES
server.post({ path: '/hashes', version: '1.0.0' }, postHashesV1)
server.get({ path: '/proof/:id', version: '1.0.0' }, getProofByIDV1)

server.listen(8080, function () {
  console.log('%s listening at %s', server.name, server.url)
})
