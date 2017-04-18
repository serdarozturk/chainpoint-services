// REDIS storage adapter
const r = require('redis')

require('dotenv').config()

// Connection URI for Redis
const REDIS_CONNECT_URI = process.env.REDIS_CONNECT_URI || 'redis://redis:6379'

// the storage client connection to use for all storage communication
var redis = null

function openConnection (callback) {
  console.log('opening')
  redis = r.createClient(REDIS_CONNECT_URI)
  redis.on('error', function (err) {
    redis.quit()
    redis = null
    return callback(err, false)
  })
  redis.on('ready', function () {
    return callback(null, true)
  })
}

function getStateObjectsByHashId (hashId, callback) {
  console.log('reading')
  redis.hgetall(hashId, function (err, stateData) {
    if (err) return callback(err)
    return callback(err, stateData)
  })
}

function writeAggStateObject (stateObject, callback) {
  console.log('writing')
  redis.hset(stateObject.hash_id, stateObject.type, JSON.stringify(stateObject.agg_state), function (err, reply) {
    if (err) return callback(err, false)
    return callback(null, true)
  })
}

function writeCalStateObject (stateObject, callback) {
  console.log('writing')
  redis.hset(stateObject.agg_id, stateObject.type, JSON.stringify(stateObject.cal_state), function (err, reply) {
    if (err) return callback(err, false)
    return callback(null, true)
  })
}

module.exports = {
  openConnection: openConnection,
  getStateObjectsByHashId: getStateObjectsByHashId,
  writeAggStateObject: writeAggStateObject,
  writeCalStateObject: writeCalStateObject
}
