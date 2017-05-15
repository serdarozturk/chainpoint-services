// PostgreSQL DB storage adapter
var Sequelize = require('sequelize')

require('dotenv').config()

// Connection URI for Postgres
const POSTGRES_CONNECT_PROTOCOL = process.env.POSTGRES_CONNECT_PROTOCOL || 'postgres:'
const POSTGRES_CONNECT_USER = process.env.POSTGRES_CONNECT_USER || 'chainpoint'
const POSTGRES_CONNECT_PW = process.env.POSTGRES_CONNECT_PW || 'chainpoint'
const POSTGRES_CONNECT_HOST = process.env.POSTGRES_CONNECT_HOST || 'postgres'
const POSTGRES_CONNECT_PORT = process.env.POSTGRES_CONNECT_PORT || 5432
const POSTGRES_CONNECT_DB = process.env.POSTGRES_CONNECT_DB || 'chainpoint'
const POSTGRES_CONNECT_URI = POSTGRES_CONNECT_PROTOCOL + '//' + POSTGRES_CONNECT_USER + ':' + POSTGRES_CONNECT_PW + '@' +
  POSTGRES_CONNECT_HOST + ':' + POSTGRES_CONNECT_PORT + '/' + POSTGRES_CONNECT_DB

const sequelize = new Sequelize(POSTGRES_CONNECT_URI, { logging: null })

var AggStates = sequelize.define('agg_states', {
  hash_id: { type: Sequelize.UUID, primaryKey: true },
  hash: { type: Sequelize.STRING },
  agg_id: { type: Sequelize.UUID },
  agg_state: { type: Sequelize.TEXT }
}, {
  indexes: [
    {
      fields: ['agg_id']
    }
  ],
  timestamps: false
})

var CalStates = sequelize.define('cal_states', {
  agg_id: { type: Sequelize.UUID, primaryKey: true },
  cal_id: { type: Sequelize.UUID },
  cal_state: { type: Sequelize.TEXT }
}, {
  indexes: [
    {
      fields: ['cal_id']
    }
  ],
  timestamps: false
})

var BtcTxStates = sequelize.define('btctx_states', {
  cal_id: { type: Sequelize.UUID, primaryKey: true },
  btctx_id: { type: Sequelize.STRING },
  btctx_state: { type: Sequelize.TEXT }
}, {
  indexes: [
    {
      fields: ['btctx_id']
    }
  ],
  timestamps: false
})

var BtcHeadStates = sequelize.define('btchead_states', {
  btctx_id: { type: Sequelize.STRING, primaryKey: true },
  btchead_height: { type: Sequelize.INTEGER },
  btchead_state: { type: Sequelize.TEXT }
}, {
  indexes: [
    {
      fields: ['btchead_height']
    }
  ],
  timestamps: false
})

var HashTrackerLog = sequelize.define('hash_tracker_log', {
  log_id: { type: Sequelize.BIGINT, autoIncrement: true, primaryKey: true },
  hash_id: { type: Sequelize.UUID },
  hash: { type: Sequelize.STRING },
  event: { type: Sequelize.TEXT }
}, {
  indexes: [
    {
      fields: ['hash_id']
    }
  ],
  timestamps: true,
  updatedAt: false
})

function openConnection (callback) {
  // test to see if the service is ready by making a authenticate request to it
  sequelize.authenticate().then((err) => {
    if (err) return callback(err)
    assertDBTables((err) => {
      if (err) return callback('could not assert tables')
      return callback(null, true)
    })
  })
    .catch(function (err) {
      if (err) return callback('not_ready')
    })
}

function assertDBTables (callback) {
  sequelize.sync().then(() => {
    // all assertions made successfully, return success
    return callback(null)
  }).catch((err) => {
    // an error has occurred with a table assertion, return error
    return callback(err)
  })
}

function getHashIdCountByAggId (aggId, callback) {
  AggStates.count({ where: { 'agg_id': aggId } }).then(function (count) {
    return callback(null, count)
  }).catch((err) => {
    return callback(err)
  })
}

function getHashIdsByAggId (aggId, callback) {
  AggStates.findAll({
    attributes: ['hash_id'],
    where: {
      agg_id: aggId
    }
  }).then((results) => {
    return callback(null, results)
  }).catch((err) => {
    return callback(err)
  })
}

function getAggStateObjectByHashId (hashId, callback) {
  AggStates.findOne({
    where: {
      hash_id: hashId
    }
  }).then((result) => {
    return callback(null, result)
  }).catch((err) => {
    return callback(err)
  })
}

function getCalStateObjectByAggId (aggId, callback) {
  CalStates.findOne({
    where: {
      agg_id: aggId
    }
  }).then((result) => {
    return callback(null, result)
  }).catch((err) => {
    return callback(err)
  })
}

function getBTCTxStateObjectByCalId (calId, callback) {
  BtcTxStates.findOne({
    where: {
      cal_id: calId
    }
  }).then((result) => {
    return callback(null, result)
  }).catch((err) => {
    return callback(err)
  })
}

function getBTCHeadStateObjectByBTCTxId (btcTxId, callback) {
  BtcHeadStates.findOne({
    where: {
      btctx_id: btcTxId
    }
  }).then((result) => {
    return callback(null, result)
  }).catch((err) => {
    return callback(err)
  })
}

function getAggStateObjectsByAggId (aggId, callback) {
  AggStates.findAll({
    where: {
      agg_id: aggId
    }
  }).then((results) => {
    return callback(null, results)
  }).catch((err) => {
    return callback(err)
  })
}

function getCalStateObjectsByCalId (calId, callback) {
  CalStates.findAll({
    where: {
      cal_id: calId
    }
  }).then((results) => {
    return callback(null, results)
  }).catch((err) => {
    return callback(err)
  })
}

function getBTCTxStateObjectsByBTCTxId (btcTxId, callback) {
  BtcTxStates.findAll({
    where: {
      btctx_id: btcTxId
    }
  }).then((results) => {
    return callback(null, results)
  }).catch((err) => {
    return callback(err)
  })
}

function getBTCHeadStateObjectsByBTCHeadId (btcHeadId, callback) {
  BtcHeadStates.findAll({
    where: {
      btchead_id: btcHeadId
    }
  }).then((results) => {
    return callback(null, results)
  }).catch((err) => {
    return callback(err)
  })
}

function writeAggStateObject (stateObject, callback) {
  AggStates.create({
    hash_id: stateObject.hash_id,
    hash: stateObject.hash,
    agg_id: stateObject.agg_id,
    agg_state: JSON.stringify(stateObject.agg_state)
  }, {
    returning: false
  }).then((res) => {
    return callback(null, true)
  }).catch((err) => {
    return callback(err, false)
  })
}

function writeCalStateObject (stateObject, callback) {
  CalStates.create({
    agg_id: stateObject.agg_id,
    cal_id: stateObject.cal_id,
    cal_state: JSON.stringify(stateObject.cal_state)
  }, {
    returning: false
  }).then((res) => {
    return callback(null, true)
  }).catch((err) => {
    return callback(err, false)
  })
}

function writeBTCTxStateObject (stateObject, callback) {
  BtcTxStates.create({
    cal_id: stateObject.cal_id,
    btctx_id: stateObject.btctx_state,
    btctx_state: JSON.stringify(stateObject.btctx_state)
  }, {
    returning: false
  }).then((res) => {
    return callback(null, true)
  }).catch((err) => {
    return callback(err, false)
  })
}

function writeBTCHeadStateObject (stateObject, callback) {
  BtcHeadStates.create({
    btctx_id: stateObject.btctx_id,
    btchead_height: stateObject.btchead_height,
    btchead_state: JSON.stringify(stateObject.btchead_state)
  }, {
    returning: false
  }).then((res) => {
    return callback(null, true)
  }).catch((err) => {
    return callback(err, false)
  })
}

function logSplitterEventForHashId (hashId, hash, callback) {
  HashTrackerLog.create({
    hash_id: hashId,
    hash: hash,
    event: 'splitter'
  }, {
    returning: false
  }).then((res) => {
    return callback(null, true)
  }).catch((err) => {
    return callback(err, false)
  })
}

function logAggregatorEventForHashId (hashId, callback) {
  HashTrackerLog.create({
    hash_id: hashId,
    event: 'aggregator'
  }, {
    returning: false
  }).then((res) => {
    return callback(null, true)
  }).catch((err) => {
    return callback(err, false)
  })
}

function logCalendarEventForHashId (hashId, callback) {
  HashTrackerLog.create({
    hash_id: hashId,
    event: 'calendar'
  }, {
    returning: false
  }).then((res) => {
    return callback(null, true)
  }).catch((err) => {
    return callback(err, false)
  })
}

function logEthEventForHashId (hashId, callback) {
  HashTrackerLog.create({
    hash_id: hashId,
    event: 'eth'
  }, {
    returning: false
  }).then((res) => {
    return callback(null, true)
  }).catch((err) => {
    return callback(err, false)
  })
}

function logBtcEventForHashId (hashId, callback) {
  HashTrackerLog.create({
    hash_id: hashId,
    event: 'btc'
  }, {
    returning: false
  }).then((res) => {
    return callback(null, true)
  }).catch((err) => {
    return callback(err, false)
  })
}

module.exports = {
  openConnection: openConnection,
  getHashIdCountByAggId: getHashIdCountByAggId,
  getHashIdsByAggId: getHashIdsByAggId,
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
  writeBTCHeadStateObject: writeBTCHeadStateObject,
  logSplitterEventForHashId: logSplitterEventForHashId,
  logAggregatorEventForHashId: logAggregatorEventForHashId,
  logCalendarEventForHashId: logCalendarEventForHashId,
  logEthEventForHashId: logEthEventForHashId,
  logBtcEventForHashId: logBtcEventForHashId
}
