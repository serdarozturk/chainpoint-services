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
const POSTGRES_CONNECT_URI = `${POSTGRES_CONNECT_PROTOCOL}//${POSTGRES_CONNECT_USER}:${POSTGRES_CONNECT_PW}@${POSTGRES_CONNECT_HOST}:${POSTGRES_CONNECT_PORT}/${POSTGRES_CONNECT_DB}`

// Set the number of tracking log events to complete in order for the hash to be considered full processed
// Currently, the value is set as 3 to represent splitter, aggregator, and calendar events
// This number will increase as additional anchor services are added
const PROOF_STEP_COUNT = 3

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

sequelize.define('hash_tracker_log', {
  hash_id: { type: Sequelize.UUID, primaryKey: true },
  hash: { type: Sequelize.STRING },
  splitter_at: { type: Sequelize.DATE },
  aggregator_at: { type: Sequelize.DATE },
  calendar_at: { type: Sequelize.DATE },
  btc_tx_at: { type: Sequelize.DATE },
  btc_head_at: { type: Sequelize.DATE },
  steps_complete: { type: Sequelize.INTEGER }
}, {
  indexes: [
    {
      fields: ['steps_complete']
    },
    {
      name: 'hash_id_and_steps_complete',
      fields: ['hash_id', 'steps_complete']
    }
  ],
  timestamps: false
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
  sequelize.query(`INSERT INTO hash_tracker_logs (hash_id, hash, splitter_at, steps_complete)
    VALUES ('${hashId}', '${hash}', clock_timestamp(), 1)
    ON CONFLICT (hash_id)
    DO UPDATE SET (splitter_at, steps_complete) = (clock_timestamp(), hash_tracker_logs.steps_complete + 1)
    WHERE hash_tracker_logs.hash_id = '${hashId}'`).then((results) => {
      return callback(null, true)
    }).catch((err) => {
      return callback(err, false)
    })
}

function logAggregatorEventForHashId (hashId, callback) {
  sequelize.query(`INSERT INTO hash_tracker_logs (hash_id, aggregator_at, steps_complete)
    VALUES ('${hashId}', clock_timestamp(), 1)
    ON CONFLICT (hash_id)
    DO UPDATE SET (aggregator_at, steps_complete) = (clock_timestamp(), hash_tracker_logs.steps_complete + 1)
    WHERE hash_tracker_logs.hash_id = '${hashId}'`).then((results) => {
      return callback(null, true)
    }).catch((err) => {
      return callback(err, false)
    })
}

function logCalendarEventForHashId (hashId, callback) {
  sequelize.query(`INSERT INTO hash_tracker_logs (hash_id, calendar_at, steps_complete)
    VALUES ('${hashId}', clock_timestamp(), 1)
    ON CONFLICT (hash_id)
    DO UPDATE SET (calendar_at, steps_complete) = (clock_timestamp(), hash_tracker_logs.steps_complete + 1)
    WHERE hash_tracker_logs.hash_id = '${hashId}'`).then((results) => {
      return callback(null, true)
    }).catch((err) => {
      return callback(err, false)
    })
}

function logBtcTxEventForHashId (hashId, callback) {
  sequelize.query(`INSERT INTO hash_tracker_logs (hash_id, btc_tx_at, steps_complete)
    VALUES ('${hashId}', clock_timestamp(), 1)
    ON CONFLICT (hash_id)
    DO UPDATE SET (btc_tx_at, steps_complete) = (clock_timestamp(), hash_tracker_logs.steps_complete + 1)
    WHERE hash_tracker_logs.hash_id = '${hashId}'`).then((results) => {
      return callback(null, true)
    }).catch((err) => {
      return callback(err, false)
    })
}

function logBtcHeadEventForHashId (hashId, callback) {
  sequelize.query(`INSERT INTO hash_tracker_logs (hash_id, btc_head_at, steps_complete)
    VALUES ('${hashId}', clock_timestamp(), 1)
    ON CONFLICT (hash_id)
    DO UPDATE SET (btc_head_at, steps_complete) = (clock_timestamp(), hash_tracker_logs.steps_complete + 1)
    WHERE hash_tracker_logs.hash_id = '${hashId}'`).then((results) => {
      return callback(null, true)
    }).catch((err) => {
      return callback(err, false)
    })
}

function deleteProcessedHashesFromAggStates (callback) {
  sequelize.query(`DELETE FROM agg_states WHERE hash_id IN
    (SELECT hash_id FROM hash_tracker_logs 
    WHERE steps_complete >= ${PROOF_STEP_COUNT})`).spread((results, meta) => {
      return callback(null, meta.rowCount)
    }).catch((err) => {
      return callback(err)
    })
}

function deleteHashTrackerLogEntries (callback) {
  sequelize.query(`DELETE FROM hash_tracker_logs WHERE steps_complete >= ${PROOF_STEP_COUNT}`).spread((results, meta) => {
    return callback(null, meta.rowCount)
  }).catch((err) => {
    return callback(err)
  })
}

function deleteCalStatesWithNoRemainingAggStates (callback) {
  sequelize.query(`DELETE FROM cal_states WHERE agg_id IN
    (SELECT c.agg_id FROM cal_states c
    LEFT JOIN agg_states a ON c.agg_id = a.agg_id
    GROUP BY c.agg_id HAVING COUNT(a.agg_id) = 0)`).spread((results, meta) => {
      return callback(null, meta.rowCount)
    }).catch((err) => {
      return callback(err)
    })
}

function deleteBtcTxStatesWithNoRemainingCalStates (callback) {
  sequelize.query(`DELETE FROM btctx_states WHERE cal_id IN
    (SELECT btctx.cal_id FROM btctx_states btctx
    LEFT JOIN cal_states c ON btctx.cal_id = c.cal_id
    GROUP BY btctx.cal_id HAVING COUNT(c.cal_id) = 0)`).spread((results, meta) => {
      return callback(null, meta.rowCount)
    }).catch((err) => {
      return callback(err)
    })
}

function deleteBtcHeadStatesWithNoRemainingBtcTxStates (callback) {
  sequelize.query(`DELETE FROM btchead_states WHERE btctx_id IN
    (SELECT btchead.btctx_id FROM btchead_states btchead
    LEFT JOIN btctx_states btctx ON btchead.btctx_id = btctx.btctx_id
    GROUP BY btchead.btctx_id HAVING COUNT(btctx.btctx_id) = 0)`).spread((results, meta) => {
      return callback(null, meta.rowCount)
    }).catch((err) => {
      return callback(err)
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
  logBtcTxEventForHashId: logBtcTxEventForHashId,
  logBtcHeadEventForHashId: logBtcHeadEventForHashId,
  deleteProcessedHashesFromAggStates: deleteProcessedHashesFromAggStates,
  deleteHashTrackerLogEntries: deleteHashTrackerLogEntries,
  deleteCalStatesWithNoRemainingAggStates: deleteCalStatesWithNoRemainingAggStates,
  deleteBtcTxStatesWithNoRemainingCalStates: deleteBtcTxStatesWithNoRemainingCalStates,
  deleteBtcHeadStatesWithNoRemainingBtcTxStates: deleteBtcHeadStatesWithNoRemainingBtcTxStates
}
