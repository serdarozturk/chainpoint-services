/* Copyright (C) 2017 Tierion
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

// load all environment variables into env object
const env = require('../lib/parse-env.js')('postgres-adapter')

// PostgreSQL DB storage adapter
let Sequelize = require('sequelize')

// Connection URI for Postgres
const POSTGRES_CONNECT_URI = `${env.POSTGRES_CONNECT_PROTOCOL}//${env.POSTGRES_CONNECT_USER}:${env.POSTGRES_CONNECT_PW}@${env.POSTGRES_CONNECT_HOST}:${env.POSTGRES_CONNECT_PORT}/${env.POSTGRES_CONNECT_DB}`

// Set the number of tracking log events to complete in order for the hash to be considered fully processed
// The value is determined by the number of anchoring services enabled
// The base of 2 represents the aggregator and calendar events
// This number will increase as additional anchor services are enabled
const PROOF_STEP_COUNT = 2 + (env.ANCHOR_BTC === 'enabled' ? 1 : 0) + (env.ANCHOR_ETH === 'enabled' ? 1 : 0)

const sequelize = new Sequelize(POSTGRES_CONNECT_URI, { logging: null })

// table for state data connecting individual hashes to aggregation roots
let AggStates = sequelize.define('agg_states', {
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
let CalStates = sequelize.define('cal_states', {
  agg_id: { type: Sequelize.UUID, primaryKey: true },
  cal_id: { type: Sequelize.INTEGER },
  cal_state: { type: Sequelize.TEXT }
}, {
  indexes: [
    {
      fields: ['cal_id']
    }
  ],
  timestamps: false
})

// table for state data connecting calendar block hashes to anchor_btc_agg_root
let AnchorBTCAggStates = sequelize.define('anchor_btc_agg_states', {
  cal_id: { type: Sequelize.INTEGER, primaryKey: true },
  anchor_btc_agg_id: { type: Sequelize.UUID },
  anchor_btc_agg_state: { type: Sequelize.TEXT }
}, {
  indexes: [
    {
      fields: ['anchor_btc_agg_id']
    }
  ],
  timestamps: false
})

// table for state data connecting one anchor_btc_agg_root to one btctx_id
let BtcTxStates = sequelize.define('btctx_states', {
  anchor_btc_agg_id: { type: Sequelize.UUID, primaryKey: true },
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
let BtcHeadStates = sequelize.define('btchead_states', {
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

async function openConnectionAsync () {
  // test to see if the service is ready by making a authenticate request to it
  await sequelize.authenticate()
  await assertDBTablesAsync()
}

async function assertDBTablesAsync () {
  await sequelize.sync()
}

async function getHashIdCountByAggIdAsync (aggId) {
  let count = await AggStates.count({ where: { 'agg_id': aggId } })
  return count
}

async function getHashIdsByAggIdAsync (aggId) {
  let results = await AggStates.findAll({
    attributes: ['hash_id'],
    where: {
      agg_id: aggId
    }
  })
  return results
}

async function getHashIdsByBtcTxIdAsync (btcTxId) {
  let results = await sequelize.query(`SELECT a.hash_id FROM agg_states a 
    INNER JOIN cal_states c ON c.agg_id = a.agg_id 
    INNER JOIN anchor_btc_agg_states aa ON aa.cal_id = c.cal_id 
    INNER JOIN btctx_states tx ON tx.anchor_btc_agg_id = aa.anchor_btc_agg_id 
    WHERE tx.btctx_id = '${btcTxId}'`, { type: sequelize.QueryTypes.SELECT })
  return results
}

async function getAggStateObjectByHashIdAsync (hashId) {
  let result = await AggStates.findOne({
    where: {
      hash_id: hashId
    }
  })
  return result
}

async function getCalStateObjectByAggIdAsync (aggId) {
  let result = await CalStates.findOne({
    where: {
      agg_id: aggId
    }
  })
  return result
}

async function getAnchorBTCAggStateObjectByCalIdAsync (calId) {
  let result = await AnchorBTCAggStates.findOne({
    where: {
      cal_id: calId
    }
  })
  return result
}

async function getBTCTxStateObjectByAnchorBTCAggIdAsync (anchorBTCAggId) {
  let result = await BtcTxStates.findOne({
    where: {
      anchor_btc_agg_id: anchorBTCAggId
    }
  })
  return result
}

async function getBTCHeadStateObjectByBTCTxIdAsync (btcTxId) {
  let result = await BtcHeadStates.findOne({
    where: {
      btctx_id: btcTxId
    }
  })
  return result
}

async function getAggStateObjectsByAggIdAsync (aggId) {
  let results = await AggStates.findAll({
    where: {
      agg_id: aggId
    }
  })
  return results
}

async function getCalStateObjectsByCalIdAsync (calId) {
  let results = await CalStates.findAll({
    where: {
      cal_id: calId
    }
  })
  return results
}

async function getAnchorBTCAggStateObjectsByAnchorBTCAggIdAsync (anchorBTCAggId) {
  let results = await AnchorBTCAggStates.findAll({
    where: {
      anchor_btc_agg_id: anchorBTCAggId
    }
  })
  return results
}

async function getBTCTxStateObjectsByBTCTxIdAsync (btcTxId) {
  let results = await BtcTxStates.findAll({
    where: {
      btctx_id: btcTxId
    }
  })
  return results
}

async function getBTCHeadStateObjectsByBTCHeadIdAsync (btcHeadId) {
  let results = await BtcHeadStates.findAll({
    where: {
      btchead_id: btcHeadId
    }
  })
  return results
}

async function writeAggStateObjectAsync (stateObject) {
  let stateString = JSON.stringify(stateObject.agg_state)
  await sequelize.query(`INSERT INTO agg_states (hash_id, hash, agg_id, agg_state)
    VALUES ('${stateObject.hash_id}', '${stateObject.hash}', '${stateObject.agg_id}', '${stateString}')
    ON CONFLICT (hash_id)
    DO UPDATE SET (hash, agg_id, agg_state) = ('${stateObject.hash}', '${stateObject.agg_id}', '${stateString}')
    WHERE agg_states.hash_id = '${stateObject.hash_id}'`)
  return true
}

async function writeCalStateObjectAsync (stateObject) {
  let stateString = JSON.stringify(stateObject.cal_state)
  await sequelize.query(`INSERT INTO cal_states (agg_id, cal_id, cal_state)
    VALUES ('${stateObject.agg_id}', '${stateObject.cal_id}', '${stateString}')
    ON CONFLICT (agg_id)
    DO UPDATE SET (cal_id, cal_state) = ('${stateObject.cal_id}', '${stateString}')
    WHERE cal_states.agg_id = '${stateObject.agg_id}'`)
  return true
}

async function writeAnchorBTCAggStateObjectAsync (stateObject) {
  let stateString = JSON.stringify(stateObject.anchor_btc_agg_state)
  await sequelize.query(`INSERT INTO anchor_btc_agg_states (cal_id, anchor_btc_agg_id, anchor_btc_agg_state)
    VALUES ('${stateObject.cal_id}', '${stateObject.anchor_btc_agg_id}', '${stateString}')
    ON CONFLICT (cal_id)
    DO UPDATE SET (anchor_btc_agg_id, anchor_btc_agg_state) = ('${stateObject.anchor_btc_agg_id}', '${stateString}')
    WHERE anchor_btc_agg_states.cal_id = '${stateObject.cal_id}'`)
  return true
}

async function writeBTCTxStateObjectAsync (stateObject) {
  let stateString = JSON.stringify(stateObject.btctx_state)
  await sequelize.query(`INSERT INTO btctx_states (anchor_btc_agg_id, btctx_id, btctx_state)
    VALUES ('${stateObject.anchor_btc_agg_id}', '${stateObject.btctx_id}', '${stateString}')
    ON CONFLICT (anchor_btc_agg_id)
    DO UPDATE SET (btctx_id, btctx_state) = ('${stateObject.btctx_id}', '${stateString}')
    WHERE btctx_states.anchor_btc_agg_id = '${stateObject.anchor_btc_agg_id}'`)
  return true
}

async function writeBTCHeadStateObjectAsync (stateObject) {
  let stateString = JSON.stringify(stateObject.btchead_state)
  await sequelize.query(`INSERT INTO btchead_states (btctx_id, btchead_height, btchead_state)
    VALUES ('${stateObject.btctx_id}', '${stateObject.btchead_height}', '${stateString}')
    ON CONFLICT (btctx_id)
    DO UPDATE SET (btchead_height, btchead_state) = ('${stateObject.btchead_height}', '${stateString}')
    WHERE btchead_states.btctx_id = '${stateObject.btctx_id}'`)
  return true
}

async function logAggregatorEventForHashIdAsync (hashId) {
  await sequelize.query(`INSERT INTO hash_tracker_logs (hash_id, aggregator_at, steps_complete)
    VALUES ('${hashId}', clock_timestamp(), 1)
    ON CONFLICT (hash_id)
    DO UPDATE SET (aggregator_at, steps_complete) = (clock_timestamp(), hash_tracker_logs.steps_complete + 1)
    WHERE hash_tracker_logs.hash_id = '${hashId}'`)
  return true
}

async function logCalendarEventForHashIdAsync (hashId) {
  await sequelize.query(`INSERT INTO hash_tracker_logs (hash_id, calendar_at, steps_complete)
    VALUES ('${hashId}', clock_timestamp(), 1)
    ON CONFLICT (hash_id)
    DO UPDATE SET (calendar_at, steps_complete) = (clock_timestamp(), hash_tracker_logs.steps_complete + 1)
    WHERE hash_tracker_logs.hash_id = '${hashId}'`)
  return true
}

async function logBtcEventForHashIdAsync (hashId) {
  await sequelize.query(`INSERT INTO hash_tracker_logs (hash_id, btc_at, steps_complete)
    VALUES ('${hashId}', clock_timestamp(), 1)
    ON CONFLICT (hash_id)
    DO UPDATE SET (btc_at, steps_complete) = (clock_timestamp(), hash_tracker_logs.steps_complete + 1)
    WHERE hash_tracker_logs.hash_id = '${hashId}'`)
  return true
}

async function logEthEventForHashIdAsync (hashId) {
  await sequelize.query(`INSERT INTO hash_tracker_logs (hash_id, eth_at, steps_complete)
    VALUES ('${hashId}', clock_timestamp(), 1)
    ON CONFLICT (hash_id)
    DO UPDATE SET (eth_at, steps_complete) = (clock_timestamp(), hash_tracker_logs.steps_complete + 1)
    WHERE hash_tracker_logs.hash_id = '${hashId}'`)
  return true
}

async function deleteProcessedHashesFromAggStatesAsync () {
  let results = await sequelize.query(`DELETE FROM agg_states WHERE hash_id IN
    (SELECT hash_id FROM hash_tracker_logs 
    WHERE steps_complete >= ${PROOF_STEP_COUNT})`)
  let meta = results[1]
  return meta.rowCount
}

async function deleteHashTrackerLogEntriesAsync () {
  let results = await sequelize.query(`DELETE FROM hash_tracker_logs WHERE steps_complete >= ${PROOF_STEP_COUNT}`)
  let meta = results[1]
  return meta.rowCount
}

async function deleteCalStatesWithNoRemainingAggStatesAsync () {
  let results = await sequelize.query(`DELETE FROM cal_states WHERE agg_id IN
    (SELECT c.agg_id FROM cal_states c
    LEFT JOIN agg_states a ON c.agg_id = a.agg_id
    GROUP BY c.agg_id HAVING COUNT(a.agg_id) = 0)`)
  let meta = results[1]
  return meta.rowCount
}

async function deleteAnchorBTCAggStatesWithNoRemainingCalStatesAsync () {
  let results = await sequelize.query(`DELETE FROM anchor_btc_agg_states WHERE cal_id IN
    (SELECT a.cal_id FROM anchor_btc_agg_states a
    LEFT JOIN cal_states c ON a.cal_id = c.cal_id
    GROUP BY a.cal_id HAVING COUNT(c.cal_id) = 0)`)
  let meta = results[1]
  return meta.rowCount
}

async function deleteBtcTxStatesWithNoRemainingAnchorBTCAggStatesAsync () {
  let results = await sequelize.query(`DELETE FROM btctx_states WHERE anchor_btc_agg_id IN
    (SELECT b.anchor_btc_agg_id FROM btctx_states b
    LEFT JOIN anchor_btc_agg_states a ON b.anchor_btc_agg_id = a.anchor_btc_agg_id
    GROUP BY b.anchor_btc_agg_id HAVING COUNT(a.anchor_btc_agg_id) = 0)`)
  let meta = results[1]
  return meta.rowCount
}

async function deleteBtcHeadStatesWithNoRemainingBtcTxStatesAsync () {
  let results = await sequelize.query(`DELETE FROM btchead_states WHERE btctx_id IN
    (SELECT btchead.btctx_id FROM btchead_states btchead
    LEFT JOIN btctx_states btctx ON btchead.btctx_id = btctx.btctx_id
    GROUP BY btchead.btctx_id HAVING COUNT(btctx.btctx_id) = 0)`)
  let meta = results[1]
  return meta.rowCount
}

module.exports = {
  openConnectionAsync: openConnectionAsync,
  getHashIdCountByAggIdAsync: getHashIdCountByAggIdAsync,
  getHashIdsByAggIdAsync: getHashIdsByAggIdAsync,
  getHashIdsByBtcTxIdAsync: getHashIdsByBtcTxIdAsync,
  getAggStateObjectByHashIdAsync: getAggStateObjectByHashIdAsync,
  getCalStateObjectByAggIdAsync: getCalStateObjectByAggIdAsync,
  getAnchorBTCAggStateObjectByCalIdAsync: getAnchorBTCAggStateObjectByCalIdAsync,
  getBTCTxStateObjectByAnchorBTCAggIdAsync: getBTCTxStateObjectByAnchorBTCAggIdAsync,
  getBTCHeadStateObjectByBTCTxIdAsync: getBTCHeadStateObjectByBTCTxIdAsync,
  getAggStateObjectsByAggIdAsync: getAggStateObjectsByAggIdAsync,
  getCalStateObjectsByCalIdAsync: getCalStateObjectsByCalIdAsync,
  getAnchorBTCAggStateObjectsByAnchorBTCAggIdAsync: getAnchorBTCAggStateObjectsByAnchorBTCAggIdAsync,
  getBTCTxStateObjectsByBTCTxIdAsync: getBTCTxStateObjectsByBTCTxIdAsync,
  getBTCHeadStateObjectsByBTCHeadIdAsync: getBTCHeadStateObjectsByBTCHeadIdAsync,
  writeAggStateObjectAsync: writeAggStateObjectAsync,
  writeCalStateObjectAsync: writeCalStateObjectAsync,
  writeAnchorBTCAggStateObjectAsync: writeAnchorBTCAggStateObjectAsync,
  writeBTCTxStateObjectAsync: writeBTCTxStateObjectAsync,
  writeBTCHeadStateObjectAsync: writeBTCHeadStateObjectAsync,
  logAggregatorEventForHashIdAsync: logAggregatorEventForHashIdAsync,
  logCalendarEventForHashIdAsync: logCalendarEventForHashIdAsync,
  logBtcEventForHashIdAsync: logBtcEventForHashIdAsync,
  logEthEventForHashIdAsync: logEthEventForHashIdAsync,
  deleteProcessedHashesFromAggStatesAsync: deleteProcessedHashesFromAggStatesAsync,
  deleteHashTrackerLogEntriesAsync: deleteHashTrackerLogEntriesAsync,
  deleteCalStatesWithNoRemainingAggStatesAsync: deleteCalStatesWithNoRemainingAggStatesAsync,
  deleteAnchorBTCAggStatesWithNoRemainingCalStatesAsync: deleteAnchorBTCAggStatesWithNoRemainingCalStatesAsync,
  deleteBtcTxStatesWithNoRemainingAnchorBTCAggStatesAsync: deleteBtcTxStatesWithNoRemainingAnchorBTCAggStatesAsync,
  deleteBtcHeadStatesWithNoRemainingBtcTxStatesAsync: deleteBtcHeadStatesWithNoRemainingBtcTxStatesAsync
}
