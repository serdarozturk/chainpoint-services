const calendarBlock = require('../lib/models/CalendarBlock.js')

// The redis connection used for all redis communication
// This value is set once the connection has been established
let redis = null

// pull in variables defined in shared CalendarBlock module
let sequelize = calendarBlock.sequelize
let CalendarBlock = calendarBlock.CalendarBlock

function getBlockByHeight (height, callback) {
  CalendarBlock.findOne({ where: { id: height } }).then(block => {
    return callback(null, block)
  }).catch((err) => {
    return callback(err)
  })
}

function getCalBlockConfirmDataByDataId (dataId, callback) {
  CalendarBlock.findOne({ where: { type: 'cal', data_id: dataId }, attributes: ['hash'] }).then(block => {
    if (!block) return callback(null, null)
    return callback(null, block.hash)
  }).catch((err) => {
    return callback(err)
  })
}

function getBtcCBlockConfirmDataByDataId (dataId, callback) {
  CalendarBlock.findOne({ where: { type: 'btc-c', dataId: dataId }, attributes: ['dataVal'] }).then(block => {
    if (!block) return callback(null, null)
    return callback(null, block.dataVal)
  }).catch((err) => {
    return callback(err)
  })
}

function getBlockRange (start, end, callback) {
  CalendarBlock.findAll({ where: { id: { $between: [start, end] } }, order: 'id ASC' }).then(blocks => {
    return callback(null, blocks)
  }).catch((err) => {
    return callback(err)
  })
}

function getLatestBlock (callback) {
  CalendarBlock.findOne({ attributes: ['id'], order: 'id DESC' }).then(lastBlock => {
    return callback(null, lastBlock)
  }).catch((err) => {
    return callback(err)
  })
}

module.exports = {
  getSequelize: () => { return sequelize },
  setRedis: (r) => { redis = r },
  getBlockByHeight: getBlockByHeight,
  getCalBlockConfirmDataByDataId: getCalBlockConfirmDataByDataId,
  getBtcCBlockConfirmDataByDataId: getBtcCBlockConfirmDataByDataId,
  getBlockRange: getBlockRange,
  getLatestBlock: getLatestBlock
}
