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
// Currently, the value is set as 4 to represent splitter, aggregator, and calendar, and btc events
// This number will increase as additional anchor services are added
const PROOF_STEP_COUNT = 4

const sequelize = new Sequelize(POSTGRES_CONNECT_URI, { logging: null })

// table for state data connecting individual hashes to aggregation roots
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

// table for state data connecting aggregation roots to calendar block hashes
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

// table for state data connecting calendar block hashes to anchor_agg_root
var AnchorAggStates = sequelize.define('anchor_agg_states', {
  cal_id: { type: Sequelize.UUID, primaryKey: true },
  anchor_agg_id: { type: Sequelize.UUID },
  anchor_agg_state: { type: Sequelize.TEXT }
}, {
  indexes: [
    {
      fields: ['anchor_agg_id']
    }
  ],
  timestamps: false
})

// table for state data connecting one anchor_agg_root to one btctx_id
var BtcTxStates = sequelize.define('btctx_states', {
  anchor_agg_id: { type: Sequelize.UUID, primaryKey: true },
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

// table for state data connecting one one btctx_id to one btchead root value at height btchead_height
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
  btc_at: { type: Sequelize.DATE },
  eth_at: { type: Sequelize.DATE },
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

function getAnchorAggStateObjectByCalId (calId, callback) {
  AnchorAggStates.findOne({
    where: {
      cal_id: calId
    }
  }).then((result) => {
    return callback(null, result)
  }).catch((err) => {
    return callback(err)
  })
}

function getBTCTxStateObjectByAnchorAggId (anchorAggId, callback) {
  BtcTxStates.findOne({
    where: {
      anchor_agg_id: anchorAggId
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

function getAnchorAggStateObjectsByAnchorAggId (anchorAggId, callback) {
  CalStates.findAll({
    where: {
      anchor_agg_id: anchorAggId
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
  let stateString = JSON.stringify(stateObject.agg_state)
  sequelize.query(`INSERT INTO agg_states (hash_id, hash, agg_id, agg_state)
    VALUES ('${stateObject.hash_id}', '${stateObject.hash}', '${stateObject.agg_id}', '${stateString}')
    ON CONFLICT (hash_id)
    DO UPDATE SET (hash, agg_id, agg_state) = ('${stateObject.hash}', '${stateObject.agg_id}', '${stateString}')
    WHERE agg_states.hash_id = '${stateObject.hash_id}'`).then((results) => {
      return callback(null, true)
    }).catch((err) => {
      return callback(err, false)
    })
}

function writeCalStateObject (stateObject, callback) {
  let stateString = JSON.stringify(stateObject.cal_state)
  sequelize.query(`INSERT INTO cal_states (agg_id, cal_id, cal_state)
    VALUES ('${stateObject.agg_id}', '${stateObject.cal_id}', '${stateString}')
    ON CONFLICT (agg_id)
    DO UPDATE SET (cal_id, cal_state) = ('${stateObject.cal_id}', '${stateString}')
    WHERE cal_states.agg_id = '${stateObject.agg_id}'`).then((results) => {
      return callback(null, true)
    }).catch((err) => {
      return callback(err, false)
    })
}

function writeAnchorAggStateObject (stateObject, callback) {
  let stateString = JSON.stringify(stateObject.anchor_agg_state)
  sequelize.query(`INSERT INTO anchor_agg_states (cal_id, anchor_agg_id, anchor_agg_state)
    VALUES ('${stateObject.cal_id}', '${stateObject.anchor_agg_id}', '${stateString}')
    ON CONFLICT (cal_id)
    DO UPDATE SET (anchor_agg_id, anchor_agg_state) = ('${stateObject.anchor_agg_id}', '${stateString}')
    WHERE anchor_agg_states.cal_id = '${stateObject.cal_id}'`).then((results) => {
      return callback(null, true)
    }).catch((err) => {
      return callback(err, false)
    })
}

function writeBTCTxStateObject (stateObject, callback) {
  let stateString = JSON.stringify(stateObject.btctx_state)
  sequelize.query(`INSERT INTO btctx_states (anchor_agg_id, btctx_id, btctx_state)
    VALUES ('${stateObject.anchor_agg_id}', '${stateObject.btctx_id}', '${stateString}')
    ON CONFLICT (anchor_agg_id)
    DO UPDATE SET (btctx_id, btctx_state) = ('${stateObject.btctx_id}', '${stateString}')
    WHERE btctx_states.anchor_agg_id = '${stateObject.anchor_agg_id}'`).then((results) => {
      return callback(null, true)
    }).catch((err) => {
      return callback(err, false)
    })
}

function writeBTCHeadStateObject (stateObject, callback) {
  let stateString = JSON.stringify(stateObject.btchead_state)
  sequelize.query(`INSERT INTO btchead_states (btctx_id, btchead_height, btchead_state)
    VALUES ('${stateObject.btctx_id}', '${stateObject.btchead_height}', '${stateString}')
    ON CONFLICT (btctx_id)
    DO UPDATE SET (btchead_height, btchead_state) = ('${stateObject.btchead_height}', '${stateString}')
    WHERE btchead_states.btctx_id = '${stateObject.btctx_id}'`).then((results) => {
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

function logBtcEventForHashId (hashId, callback) {
  sequelize.query(`INSERT INTO hash_tracker_logs (hash_id, btc_at, steps_complete)
    VALUES ('${hashId}', clock_timestamp(), 1)
    ON CONFLICT (hash_id)
    DO UPDATE SET (btc_at, steps_complete) = (clock_timestamp(), hash_tracker_logs.steps_complete + 1)
    WHERE hash_tracker_logs.hash_id = '${hashId}'`).then((results) => {
      return callback(null, true)
    }).catch((err) => {
      return callback(err, false)
    })
}

function logEthEventForHashId (hashId, callback) {
  sequelize.query(`INSERT INTO hash_tracker_logs (hash_id, eth_at, steps_complete)
    VALUES ('${hashId}', clock_timestamp(), 1)
    ON CONFLICT (hash_id)
    DO UPDATE SET (eth_at, steps_complete) = (clock_timestamp(), hash_tracker_logs.steps_complete + 1)
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

function deleteAnchorAggStatesWithNoRemainingCalStates (callback) {
  sequelize.query(`DELETE FROM anchor_agg_states WHERE cal_id IN
    (SELECT a.cal_id FROM anchor_agg_states a
    LEFT JOIN cal_states c ON a.cal_id = c.cal_id
    GROUP BY a.cal_id HAVING COUNT(c.cal_id) = 0)`).spread((results, meta) => {
      return callback(null, meta.rowCount)
    }).catch((err) => {
      return callback(err)
    })
}

function deleteBtcTxStatesWithNoRemainingAnchorAggStates (callback) {
  sequelize.query(`DELETE FROM btctx_states WHERE anchor_agg_id IN
    (SELECT b.anchor_agg_id FROM btctx_states b
    LEFT JOIN anchor_agg_states a ON b.anchor_agg_id = a.anchor_agg_id
    GROUP BY b.anchor_agg_id HAVING COUNT(a.anchor_agg_id) = 0)`).spread((results, meta) => {
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
  getAnchorAggStateObjectByCalId: getAnchorAggStateObjectByCalId,
  getBTCTxStateObjectByAnchorAggId: getBTCTxStateObjectByAnchorAggId,
  getBTCHeadStateObjectByBTCTxId: getBTCHeadStateObjectByBTCTxId,
  getAggStateObjectsByAggId: getAggStateObjectsByAggId,
  getCalStateObjectsByCalId: getCalStateObjectsByCalId,
  getAnchorAggStateObjectsByAnchorAggId: getAnchorAggStateObjectsByAnchorAggId,
  getBTCTxStateObjectsByBTCTxId: getBTCTxStateObjectsByBTCTxId,
  getBTCHeadStateObjectsByBTCHeadId: getBTCHeadStateObjectsByBTCHeadId,
  writeAggStateObject: writeAggStateObject,
  writeCalStateObject: writeCalStateObject,
  writeAnchorAggStateObject: writeAnchorAggStateObject,
  writeBTCTxStateObject: writeBTCTxStateObject,
  writeBTCHeadStateObject: writeBTCHeadStateObject,
  logSplitterEventForHashId: logSplitterEventForHashId,
  logAggregatorEventForHashId: logAggregatorEventForHashId,
  logCalendarEventForHashId: logCalendarEventForHashId,
  logBtcEventForHashId: logBtcEventForHashId,
  logEthEventForHashId: logEthEventForHashId,
  deleteProcessedHashesFromAggStates: deleteProcessedHashesFromAggStates,
  deleteHashTrackerLogEntries: deleteHashTrackerLogEntries,
  deleteCalStatesWithNoRemainingAggStates: deleteCalStatesWithNoRemainingAggStates,
  deleteAnchorAggStatesWithNoRemainingCalStates: deleteAnchorAggStatesWithNoRemainingCalStates,
  deleteBtcTxStatesWithNoRemainingAnchorAggStates: deleteBtcTxStatesWithNoRemainingAnchorAggStates,
  deleteBtcHeadStatesWithNoRemainingBtcTxStates: deleteBtcHeadStatesWithNoRemainingBtcTxStates
}
