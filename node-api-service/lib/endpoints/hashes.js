const restify = require('restify')
const env = require('../parse-env.js')('api')
const _ = require('lodash')
const utils = require('../utils.js')

// Generate a v1 UUID (time-based)
// see: https://github.com/broofa/node-uuid
const uuidv1 = require('uuid/v1')

// The channel used for all amqp communication
// This value is set once the connection has been established
let amqpChannel = null

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
    cal: utils.formatDateISO8601NoMs(utils.addMinutes(timestamp, 0.1)),
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
    hashObj.hash_id = uuidv1()
    hashObj.hash = hash
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

module.exports = {
  postHashesV1: postHashesV1,
  generatePostHashesResponse: generatePostHashesResponse,
  setAMQPChannel: (chan) => { amqpChannel = chan }
}
