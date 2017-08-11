const restify = require('restify')
const env = require('../parse-env.js')('api')
const _ = require('lodash')
const utils = require('../utils.js')
const BLAKE2s = require('blake2s-js')

// Generate a v1 UUID (time-based)
// see: https://github.com/broofa/node-uuid
const uuidv1 = require('uuid/v1')

// The channel used for all amqp communication
// This value is set once the connection has been established
let amqpChannel = null

// The latest NIST data
// This value is updated from consul events as changes are detected
let nistLatest = null
let nistLatestEpoch = null

/**
 * Generate the values for the 'meta' property in a POST /hashes response.
 *
 * Returns an Object with metadata about a POST /hashes request
 * including a 'timestamp', and hints for estimated time to completion
 * for various operations.
 *
 * @returns {Object}
 */
function generatePostHashesResponseMetadata () {
  let metaDataObj = {}
  let timestamp = new Date()
  metaDataObj.submitted_at = utils.formatDateISO8601NoMs(timestamp)

  // FIXME : Calculate these based on last anchor time and known interval?
  metaDataObj.processing_hints = {
    cal: utils.formatDateISO8601NoMs(utils.addSeconds(timestamp, 10)),
    eth: utils.formatDateISO8601NoMs(utils.addMinutes(timestamp, 41)),
    btc: utils.formatDateISO8601NoMs(utils.addMinutes(timestamp, 61))
  }

  return metaDataObj
}

/**
 * Converts an array of hash strings to a object suitable to
 * return to HTTP clients.
 *
 * @param {string[]} hashes - An array of string hashes to process
 * @returns {Object} An Object with 'meta' and 'hashes' properties
 */
function generatePostHashesResponse (hashes) {
  let lcHashes = utils.lowerCaseHashes(hashes)
  let hashObjects = lcHashes.map((hash) => {
    let hashObj = {}
    hashObj.hash = hash
    hashObj.nist = nistLatest || ''

    // Compute a five byte BLAKE2s hash of the
    // timestamp that will be embedded in the UUID.
    // This allows the UUID to verifiably reflect the
    // combined NTP time, the hash submitted, and the current
    // NIST Beacon value if available. Thus these values
    // are represented both in the BLAKE2s hash and in
    // the full timestamp embedded in the v1 UUID.
    //
    // RFC 4122 allows the MAC address in a version 1
    // (or 2) UUID to be replaced by a random 48-bit Node ID,
    // either because the node does not have a MAC address, or
    // because it is not desirable to expose it. In that case, the
    // RFC requires that the least significant bit of the first
    // octet of the Node ID should be set to `1`. This code
    // uses a five byte BLAKE2s hash as a verifier in place
    // of the MAC address. This also prevents leakage of server
    // info.
    //
    // This value can be checked on receipt of the hash_id UUID
    // by extracting the bytes of the last segment of the UUID.
    // e.g. If the UUID is 'b609358d-7979-11e7-ae31-01ba7816bf8f'
    // the Node ID hash is the six bytes shown in '01ba7816bf8f'.
    // Any client that can access the timestamp in the UUID,
    // the NIST Beacon value, and the original hash can recompute
    // the verification hash and compare it.
    //
    // The UUID can also be verified for correct time by a
    // client that itself has an accurate NTP clock at the
    // moment when returned to the client. This allows
    // a client to verify, likely within a practical limit
    // of approximately 500ms depending on network latency,
    // the accuracy of the returned UUIDv1 timestamp.
    //
    // See JS API for injecting time and Node ID in the UUID API:
    // https://github.com/kelektiv/node-uuid/blob/master/README.md
    //
    let uuidTimestamp = new Date().getTime()
    // 5 byte length BLAKE2s hash w/ personalization
    let h = new BLAKE2s(5, { personalization: Buffer.from('CHAINPNT') })
    let hashStr = [
      uuidTimestamp.toString(),
      uuidTimestamp.toString().length,
      hashObj.hash,
      hashObj.hash.length,
      hashObj.nist,
      hashObj.nist.length
    ].join(':')

    h.update(Buffer.from(hashStr))

    hashObj.hash_id = uuidv1({
      msecs: uuidTimestamp,
      node: Buffer.concat([Buffer.from([0x01]), h.digest()])
    })
    return hashObj
  })

  return {
    meta: generatePostHashesResponseMetadata(hashObjects),
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
  if (req.contentType() !== 'application/json') {
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
  if (_.size(req.params.hashes) > env.POST_HASHES_MAX) {
    return next(new restify.InvalidArgumentError(`invalid JSON body, hashes Array max size of ${env.POST_HASHES_MAX} exceeded`))
  }

  // validate hashes are individually well formed
  let containsValidHashes = _.every(req.params.hashes, (hash) => {
    return /^([a-fA-F0-9]{2}){20,64}$/.test(hash)
  })

  if (!containsValidHashes) {
    return next(new restify.InvalidArgumentError('invalid JSON body, invalid hashes present'))
  }

  // if NIST value is present, ensure NTP time is >= latest NIST value
  if (nistLatest) {
    let NTPEpoch = Math.ceil(Date.now() / 1000) + 1 // round up and add 1 second forgiveness in time sync
    if (NTPEpoch < nistLatestEpoch) {
      // this shoud not occur, log and return error to initiate retry
      console.error(`Bad NTP time generated in UUID : NTP ${NTPEpoch} < NIST ${nistLatestEpoch}`)
      return next(new restify.InternalServerError('Bad NTP time'))
    }
  }

  let responseObj = generatePostHashesResponse(req.params.hashes)

  // AMQP / RabbitMQ

  // validate amqp channel has been established
  if (!amqpChannel) {
    return next(new restify.InternalServerError('Message could not be delivered'))
  }
  amqpChannel.sendToQueue(env.RMQ_WORK_OUT_SPLITTER_QUEUE, Buffer.from(JSON.stringify(responseObj)), { persistent: true },
    (err) => {
      if (err !== null) {
        console.error(env.RMQ_WORK_OUT_SPLITTER_QUEUE, 'publish message nacked')
        return next(new restify.InternalServerError('Message could not be delivered'))
      } else {
        console.log(env.RMQ_WORK_OUT_SPLITTER_QUEUE, 'publish message acked')
      }
    })

  res.send(responseObj)
  return next()
}

function updateNistVars (nistValue) {
  try {
    let nistTimestampString = nistValue.split(':')[0].toString()
    let nistTimestampInt = parseInt(nistTimestampString) // epoch in seconds
    if (!nistTimestampInt) throw new Error('Bad NIST time encountered, skipping NTP/UUID > NIST validation')
    nistLatest = nistValue
    nistLatestEpoch = nistTimestampInt
  } catch (error) {
    // the nist value being set must be bad, disable UUID / NIST validation until valid value is received
    console.error(error.message)
    nistLatest = null
    nistLatestEpoch = null
  }
}

module.exports = {
  postHashesV1: postHashesV1,
  generatePostHashesResponse: generatePostHashesResponse,
  setAMQPChannel: (chan) => { amqpChannel = chan },
  getNistLatest: () => { return nistLatest },
  setNistLatest: (val) => { updateNistVars(val) }
}
