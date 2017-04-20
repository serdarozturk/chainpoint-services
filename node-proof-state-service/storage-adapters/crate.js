// Crate DB storage adapter
const crate = require('node-crate')
const http = require('http')

require('dotenv').config()

// Connection URI for CrateDB
const CRATE_CONNECT_PROTOCOL = process.env.CRATE_CONNECT_PROTOCOL || 'http:'
const CRATE_CONNECT_HOST = process.env.CRATE_CONNECT_HOST || 'crate'
const CRATE_CONNECT_PORT = process.env.CRATE_CONNECT_PORT || '4200'
const CRATE_CONNECT_URI = CRATE_CONNECT_PROTOCOL + '//' + CRATE_CONNECT_HOST + ':' + CRATE_CONNECT_PORT

function openConnection (callback) {
  // test to see if the service is ready by making a get request to it
  http.get({
    protocol: CRATE_CONNECT_PROTOCOL,
    hostname: CRATE_CONNECT_HOST,
    port: CRATE_CONNECT_PORT,
    path: '/',
    agent: false
  }, (res) => {
    // the service has responded, so it is up and ready
    crate.connect(CRATE_CONNECT_URI)
    assertDBTables((err) => {
      if (err) return callback('fatal_error')
      return callback(null, true)
    })
  }).on('error', () => {
    // there is no response, the service is not ready, trigger retry
    return callback('not_ready')
  })
}

function assertDBTables (callback) {
  console.log('asserting tables')

  let assertAggStateTable = crate.execute('CREATE TABLE IF NOT EXISTS "proof_state_service"."agg_states" (' +
    '"hash_id" STRING, ' +
    '"hash" STRING, ' +
    '"agg_id" STRING, ' +
    '"agg_state" STRING' +
    ') ' + getTableExtendedProperties()
  )

  let assertCalStateTable = crate.execute('CREATE TABLE IF NOT EXISTS "proof_state_service"."cal_states" (' +
    '"agg_id" STRING, ' +
    '"cal_id" STRING, ' +
    '"cal_state" STRING' +
    ') ' + getTableExtendedProperties()
  )

  let assertBTCTxStateTable = crate.execute('CREATE TABLE IF NOT EXISTS "proof_state_service"."btctx_states" (' +
    '"cal_id" STRING, ' +
    '"btctx_id" STRING, ' +
    '"btctx_state" STRING' +
    ') ' + getTableExtendedProperties()
  )

  let assertBTCHeadStateTable = crate.execute('CREATE TABLE IF NOT EXISTS "proof_state_service"."btchead_states" (' +
    '"btctx_id" STRING, ' +
    '"btchead_height" INTEGER, ' +
    '"btchead_state" STRING' +
    ') ' + getTableExtendedProperties()
  )

  Promise.all([assertAggStateTable, assertCalStateTable, assertBTCTxStateTable, assertBTCHeadStateTable]).then(resuts => {
    // all assertions made successfully, return success
    return callback(null)
  }).catch((err) => {
    // an error has occurred with a table assertion, return error
    return callback(err)
  })
}

function getTableExtendedProperties () {
  let extProperties = 'CLUSTERED INTO 4 SHARDS ' +
    'WITH (' +
    '"blocks.metadata" = false, ' +
    '"blocks.read" = false, ' +
    '"blocks.read_only" = false, ' +
    '"blocks.write" = false, ' +
    'column_policy = \'dynamic\', ' +
    'number_of_replicas = \'1\', ' +
    '"recovery.initial_shards" = \'quorum\', ' +
    'refresh_interval = 1000, ' +
    '"routing.allocation.enable" = \'all\', ' +
    '"routing.allocation.total_shards_per_node" = -1, ' +
    '"translog.disable_flush" = false, ' +
    '"translog.flush_threshold_ops" = 2147483647, ' +
    '"translog.flush_threshold_period" = 1800000, ' +
    '"translog.flush_threshold_size" = 209715200, ' +
    '"translog.interval" = 5000, ' +
    '"translog.sync_interval" = 5000, ' +
    '"unassigned.node_left.delayed_timeout" = 60000, ' +
    '"warmer.enabled" = true' +
    ')'
  return extProperties
}

function getAggStateObjectByHashId (hashId, callback) {
  crate.execute('SELECT * FROM proof_state_service.agg_states WHERE hash_id == ?', [hashId]).then((res) => {
    return callback(null, res.json)
  }).catch((err) => {
    return callback(err)
  })
}

function getCalStateObjectByAggId (aggId, callback) {
  crate.execute('SELECT * FROM proof_state_service.cal_states WHERE agg_id == ?', [aggId]).then((res) => {
    return callback(null, res.json)
  }).catch((err) => {
    return callback(err)
  })
}

function getBTCTxStateObjectByCalId (calId, callback) {
  crate.execute('SELECT * FROM proof_state_service.btctx_states WHERE cal_id == ?', [calId]).then((res) => {
    return callback(null, res.json)
  }).catch((err) => {
    return callback(err)
  })
}

function getBTCHeadStateObjectByBTCTxId (btcTxId, callback) {
  crate.execute('SELECT * FROM proof_state_service.btchead_states WHERE btctx_id == ?', [btcTxId]).then((res) => {
    return callback(null, res.json)
  }).catch((err) => {
    return callback(err)
  })
}

function getAggStateObjectsByAggId (aggId, callback) {
  crate.execute('SELECT * FROM proof_state_service.agg_states WHERE agg_id == ?', [aggId]).then((res) => {
    return callback(null, res.json)
  }).catch((err) => {
    return callback(err)
  })
}

function getCalStateObjectsByCalId (calId, callback) {
  crate.execute('SELECT * FROM proof_state_service.cal_states WHERE cal_id == ?', [calId]).then((res) => {
    return callback(null, res.json)
  }).catch((err) => {
    return callback(err)
  })
}

function getBTCTxStateObjectsByBTCTxId (btcTxId, callback) {
  crate.execute('SELECT * FROM proof_state_service.btctx_states WHERE btctx_id == ?', [btcTxId]).then((res) => {
    return callback(null, res.json)
  }).catch((err) => {
    return callback(err)
  })
}

function getBTCHeadStateObjectsByBTCHeadId (btcHeadId, callback) {
  crate.execute('SELECT * FROM proof_state_service.btchead_states WHERE btchead_id == ?', [btcHeadId]).then((res) => {
    return callback(null, res.json)
  }).catch((err) => {
    return callback(err)
  })
}

function writeAggStateObject (stateObject, callback) {
  crate.execute('INSERT INTO proof_state_service.agg_states (hash_id, hash, agg_id, agg_state) VALUES (?,?,?,?)', [
    stateObject.hash_id,
    stateObject.hash,
    stateObject.agg_id,
    stateObject.agg_state
  ]).then((res) => {
    return callback(null, true)
  }).catch((err) => {
    return callback(err, false)
  })
}

function writeCalStateObject (stateObject, callback) {
  crate.execute('INSERT INTO proof_state_service.cal_states (agg_id, cal_id, cal_state) VALUES (?,?,?)', [
    stateObject.agg_id,
    stateObject.cal_id,
    stateObject.cal_state
  ]).then((res) => {
    return callback(null, true)
  }).catch((err) => {
    return callback(err, false)
  })
}

function writeBTCTxStateObject (stateObject, callback) {
  crate.execute('INSERT INTO proof_state_service.btctx_states (cal_id, btctx_id, btctx_state) VALUES (?,?,?)', [
    stateObject.cal_id,
    stateObject.btctx_id,
    stateObject.btctx_state
  ]).then((res) => {
    return callback(null, true)
  }).catch((err) => {
    return callback(err, false)
  })
}

function writeBTCHeadStateObject (stateObject, callback) {
  crate.execute('INSERT INTO proof_state_service.btchead_states (btctx_id, btchead_height, btchead_state) VALUES (?,?,?)', [
    stateObject.btctx_id,
    stateObject.btchead_height,
    stateObject.btchead_state
  ]).then((res) => {
    return callback(null, true)
  }).catch((err) => {
    return callback(err, false)
  })
}

module.exports = {
  openConnection: openConnection,
  getAggStateObjectByHashId: getAggStateObjectByHashId,
  getCalStateObjectByAggId: getCalStateObjectByAggId,
  getBTCTxStateObjectByCalId: getBTCTxStateObjectByCalId,
  getBTCHeadStateObjectByBTCTxId: getBTCHeadStateObjectByBTCTxId,
  getAggStateObjectsByAggId: getAggStateObjectsByAggId,
  getCalStateObjectsByCalId: getCalStateObjectsByCalId,
  getBTCTxStateObjectsByBTCTxId: getBTCTxStateObjectsByBTCTxId,
  getBTCHeadStateObjectsByBTCHeadId: getBTCHeadStateObjectsByBTCHeadId,
  writeAggStateObject: writeAggStateObject,
  writeCalStateObject: writeCalStateObject,
  writeBTCTxStateObject: writeBTCTxStateObject,
  writeBTCHeadStateObject: writeBTCHeadStateObject
}
