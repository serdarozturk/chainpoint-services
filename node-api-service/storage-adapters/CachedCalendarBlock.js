const calendarBlock = require('../lib/models/CalendarBlock.js')
const async = require('async')

const CAL_CACHE_EXPIRE_MINUTES = 60 * 24
const CACHE_BLOCK_KEY_PREFIX = 'cal:block'
const CACHE_BLOCK_DATA_KEY_PREFIX = 'cal:data'

// The redis connection used for all redis communication
// This value is set once the connection has been established
let redis = null

// pull in variables defined in shared CalendarBlock module
let sequelize = calendarBlock.sequelize
let CalendarBlock = calendarBlock.CalendarBlock

function cacheReadBlock (height, callback) {
  // attempt to read block for the given height
  let key = `${CACHE_BLOCK_KEY_PREFIX}:${height}`
  redis.get(key, (err, block) => {
    if (err) return callback(err)
    return callback(null, JSON.parse(block))
  })
}

function cacheReadData (type, dataId, callback) {
  // attempt to read block data for block of given type and dataId
  let dataKey = `${CACHE_BLOCK_DATA_KEY_PREFIX}:${type}:${dataId}`
  redis.get(dataKey, (err, dataVal) => {
    if (err) return callback(err)
    return callback(null, dataVal)
  })
}

function cacheWriteBlock (block, callback) {
  // write block to cache, and optionally caches anchor data values for relevant block types
  let multi = redis.multi()
  let key = `${CACHE_BLOCK_KEY_PREFIX}:${block.id}`
  multi.set(key, JSON.stringify(block), 'EX', CAL_CACHE_EXPIRE_MINUTES * 60)
  switch (block.type) {
    case 'cal':
      // write a cal data value, dataId:hash
      let calKey = `${CACHE_BLOCK_DATA_KEY_PREFIX}:cal:${block.dataId}`
      multi.set(calKey, block.hash, 'EX', CAL_CACHE_EXPIRE_MINUTES * 60)
      break
    case 'btc-c':
      // write a btc data value, dataId:dataVal
      let btcKey = `${CACHE_BLOCK_DATA_KEY_PREFIX}:btc-c:${block.dataId}`
      multi.set(btcKey, block.dataVal, 'EX', CAL_CACHE_EXPIRE_MINUTES * 60)
      break
  }
  multi.exec((err, replies) => {
    if (err) return callback(err)
    return callback(null)
  })
}

function cacheWriteData (type, dataId, dataVal, callback) {
  // write dataval to cache
  let key = `${CACHE_BLOCK_DATA_KEY_PREFIX}:${type}:${dataId}`
  redis.set(key, dataVal, 'EX', CAL_CACHE_EXPIRE_MINUTES * 60, (err, res) => {
    if (err) return callback(err)
    return callback(null)
  })
}

function getBlockByHeight (height, callback) {
  async.waterfall([
    // first, try to retrieve block from cache
    (wfCallback) => {
      cacheReadBlock(height, wfCallback)
    },
    // if block is null, it was not in cache, try to retrieve block from db
    (block, wfCallback) => {
      // if block was found, skip to next function
      if (block) return wfCallback(null, block, false)
      // otherwise, try to read from database
      CalendarBlock.findOne({ where: { id: height } }).nodeify((err, block) => {
        if (err) return wfCallback(err)
        // if a block was found, convert it to a plain JS object
        if (block) block = block.get({ plain: true })
        return wfCallback(null, block, true)
      })
    },
    // if the block was found, and it was read from the database, write to cache
    (block, blockFromDB, wfCallback) => {
      if (block && blockFromDB) {
        cacheWriteBlock(block, (err) => {
          if (err) {
            // an error occurred when attempting to write the block to redis
            // log the error, but still return the value retrieved from the database
            console.error(`Error writing to block cache: ${err.message}`)
          }
          return wfCallback(null, block)
        })
      } else {
        return wfCallback(null, block)
      }
    }
  ], (err, block) => {
    if (err) return callback(err)
    return callback(null, block)
  })
}

function getCalBlockConfirmDataByDataId (dataId, callback) {
  async.waterfall([
    // first, try to retrieve block from cache
    (wfCallback) => {
      cacheReadData('cal', dataId, wfCallback)
    },
    // if hash is null, it was not in cache, try to retrieve hash from db
    (hash, wfCallback) => {
      // if hash was found, skip to next function
      if (hash) return wfCallback(null, hash, false)
      // otherwise, try to read from database
      CalendarBlock.findOne({ where: { type: 'cal', data_id: dataId }, attributes: ['hash'] }).nodeify((err, block) => {
        if (err) return callback(err)
        if (!block) return callback(null, null)
        return callback(null, block.hash)
      })
    },
    // if the hash was found, and it was read from the database, write to cache
    (hash, valueFromDB, wfCallback) => {
      if (hash && valueFromDB) {
        cacheWriteData('cal', dataId, hash, (err) => {
          if (err) return wfCallback(err)
          return wfCallback(null, hash)
        })
      } else {
        return wfCallback(null, hash)
      }
    }
  ], (err, hash) => {
    if (err) return callback(err)
    return callback(null, hash)
  })
}

function getBtcCBlockConfirmDataByDataId (dataId, callback) {
  async.waterfall([
    // first, try to retrieve block from cache
    (wfCallback) => {
      cacheReadData('btc-c', dataId, wfCallback)
    },
    // if dataVal is null, it was not in cache, try to retrieve dataVal from db
    (dataVal, wfCallback) => {
      // if dataVal was found, skip to next function
      if (dataVal) return wfCallback(null, dataVal, false)
      // otherwise, try to read from database
      CalendarBlock.findOne({ where: { type: 'btc-c', dataId: dataId }, attributes: ['dataVal'] }).nodeify((err, block) => {
        if (err) return callback(err)
        if (!block) return callback(null, null)
        return callback(null, block.dataVal)
      })
    },
    // if the dataVal was found, and it was read from the database, write to cache
    (dataVal, valueFromDB, wfCallback) => {
      if (dataVal && valueFromDB) {
        cacheWriteData('btc-c', dataId, dataVal, (err) => {
          if (err) return wfCallback(err)
          return wfCallback(null, dataVal)
        })
      } else {
        return wfCallback(null, dataVal)
      }
    }
  ], (err, dataVal) => {
    if (err) return callback(err)
    return callback(null, dataVal)
  })
}

function getBlockRange (start, end, callback) {
  async.waterfall([
    // first, try to retrieve blocks from cache
    (wfCallback) => {
      // build block height request list
      let heights = []
      for (let x = start; x <= end; x++) {
        heights.push(x)
      }
      let cachedBlocks = []
      // attempt to read block from cache for each height
      async.eachLimit(heights, 500, (height, eachCallback) => {
        cacheReadBlock(height, (err, block) => {
          if (err) return eachCallback(err)
          cachedBlocks.push({ height: height, block: block })
          return eachCallback(null)
        })
      }, (err) => {
        if (err) return wfCallback(err)
        return wfCallback(null, cachedBlocks)
      })
    },
    (cachedBlocks, wfCallback) => {
      // sort the cache results by height
      cachedBlocks.sort((a, b) => { return a.height - b.height })
      // discover all ranges in blocks array that have null blocks
      let nullRanges = []
      let lastNull = -1
      let inNullRange = false
      for (let x = 0; x < cachedBlocks.length; x++) {
        if (cachedBlocks[x].block === null) {
          if (!inNullRange) {
            lastNull = cachedBlocks[x].height
            inNullRange = true
          }
        } else {
          if (inNullRange) {
            nullRanges.push({ startHeight: lastNull, endHeight: cachedBlocks[x - 1].height })
            inNullRange = false
          }
        }
      }
      if (inNullRange) nullRanges.push({ startHeight: lastNull, endHeight: cachedBlocks[cachedBlocks.length - 1].height })
      // see how many null ranges there are in the cached block array
      // handle the querying of the remainder from the db differently based on how fragmented the cache is
      // if there are more than 10 null ranges, just query the entire range from the db in one call
      // otherwise, query the individual ranges
      if (nullRanges.length > 10) nullRanges = [{ startHeight: cachedBlocks[0].height, endHeight: cachedBlocks[cachedBlocks.length - 1].height }]

      let dbBlocks = []
      async.each(nullRanges, (nullRange, eachCallback) => {
        CalendarBlock.findAll({ where: { id: { $between: [nullRange.startHeight, nullRange.endHeight] } }, order: 'id ASC' }).nodeify((err, blocks) => {
          if (err) return eachCallback(err)
          for (let x = 0; x < blocks.length; x++) {
            blocks[x] = blocks[x].get({ plain: true })
          }
          dbBlocks = dbBlocks.concat(blocks)
          return eachCallback(null)
        })
      }, (err) => {
        if (err) return wfCallback(err)
        // build one array from the cache and db array
        // indicate in the array which blocks need to be cached
        let blocks = []
        for (let x = 0; x < cachedBlocks.length; x++) {
          if (cachedBlocks[x].block === null) {
            // set this value from the dbBlocks array
            blocks.push({
              height: cachedBlocks[x].height,
              block: dbBlocks.find((dbBlock) => { return dbBlock.id === cachedBlocks[x].height.toString() }),
              cached: false
            })
          } else {
            blocks.push({
              height: cachedBlocks[x].height,
              block: cachedBlocks[x].block,
              cached: true
            })
          }
        }
        return wfCallback(null, blocks)
      })
    },
    (blocks, wfCallback) => {
      // add all uncached block to cache
      let uncachedBlocks = blocks.filter((block) => {
        return block.cached === false && block.block
      })
      console.log('uncachedBlocks')
      console.log(uncachedBlocks)
      async.eachLimit(uncachedBlocks, 500, (uncachedBlock, eachCallback) => {
        cacheWriteBlock(uncachedBlock.block, (err) => {
          if (err) {
            // an error occurred when attempting to write the block to redis
            // log the error, but still return the value retrieved from the database
            console.error(`Error writing to block cache: ${err.message}`)
          }
          return eachCallback(null)
        })
      }, (err) => {
        if (err) return wfCallback(err)
        // finalize block array, return only block data and filter out blocks that do not exist
        blocks = blocks.map((block) => {
          return block.block
        }).filter((block) => {
          return block
        })
        console.log('blocks')
        console.log(blocks)
        return wfCallback(null, blocks)
      })
    }
  ], (err, blocks) => {
    if (err) return callback(err)
    return callback(null, blocks)
  })
}

function getLatestBlock (callback) {
  // this value does not get cached because it frequently changes, just read from db diretly
  CalendarBlock.findOne({ attributes: ['id'], order: 'id DESC' }).nodeify((err, lastBlock) => {
    if (err) return callback(err)
    return callback(null, lastBlock)
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
