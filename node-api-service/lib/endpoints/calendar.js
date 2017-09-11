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

const _ = require('lodash')
const restify = require('restify')
const env = require('../parse-env.js')('api')
const async = require('async')
const cachedCalendarBlock = require('../models/CachedCalendarBlock.js')

/**
 * GET /calendar/:height handler
 *
 * Expects a path parameter 'height' as an integer
 *
 * Returns a calendar block by calendar height
 */
function getCalBlockByHeightV1 (req, res, next) {
  let height = parseInt(req.params.height, 10)

  // ensure that :height is an integer
  if (!_.isInteger(height) || height < 0) {
    return next(new restify.InvalidArgumentError('invalid request, height must be a positive integer'))
  }
  cachedCalendarBlock.getBlockByHeight(height, (err, block) => {
    if (err) return next(new restify.InternalError(err))
    if (!block) return next(new restify.NotFoundError())
    res.contentType = 'application/json'
    block.id = parseInt(block.id, 10)
    block.time = parseInt(block.time, 10)
    block.version = parseInt(block.version, 10)
    res.send(block)
    return next()
  })
}

/**
 * GET /calendar/:fromHeight/:toHeight handler
 *
 * Expects path parameters 'fromHeight' and 'topHeight' as an integers
 *
 * Returns an array of calendar blocks
 */
function getCalBlockRangeV1 (req, res, next) {
  let fromHeight = parseInt(req.params.fromHeight, 10)
  let toHeight = parseInt(req.params.toHeight, 10)

  // ensure that :fromHeight is an integer
  if (!_.isInteger(fromHeight) || fromHeight < 0) {
    return next(new restify.InvalidArgumentError('invalid request, fromHeight must be a positive integer'))
  }
  // ensure that :toHeight is an integer
  if (!_.isInteger(toHeight) || toHeight < 0) {
    return next(new restify.InvalidArgumentError('invalid request, toHeight must be a positive integer'))
  }
  // ensure that :toHeight is greater or equal to :fromHeight
  if (toHeight < fromHeight) {
    return next(new restify.InvalidArgumentError('invalid request, toHeight must be greater or equal to fromHeight'))
  }
  // ensure the requested range does not exceed GET_CALENDAR_BLOCKS_MAX
  if ((toHeight - fromHeight + 1) > env.GET_CALENDAR_BLOCKS_MAX) {
    return next(new restify.InvalidArgumentError(`invalid request, requested range may not exceed ${env.GET_CALENDAR_BLOCKS_MAX} blocks`))
  }

  async.waterfall([
    (callback) => {
      cachedCalendarBlock.getLatestBlock((err, lastBlock) => {
        if (err) return callback(err)
        if (!lastBlock) return callback('no_blocks')
        lastBlock.id = parseInt(lastBlock.id, 10)
        return callback(null, lastBlock.id)
      })
    },
    (blockHeight, callback) => {
      cachedCalendarBlock.getBlockRange(fromHeight, toHeight, (err, blocks) => {
        if (err) return callback(err)
        if (!blocks || blocks.length === 0) blocks = []
        // convert requisite fields to integers
        for (let x = 0; x < blocks.length; x++) {
          blocks[x].id = parseInt(blocks[x].id, 10)
          blocks[x].time = parseInt(blocks[x].time, 10)
          blocks[x].version = parseInt(blocks[x].version, 10)
        }
        let results = {}
        results.blocks = blocks
        results.start = fromHeight
        results.end = toHeight
        results.height = blockHeight
        return callback(null, results)
      })
    }
  ], (err, results) => {
    if (err) {
      console.error(err)
      return next(new restify.InternalError(err))
    }
    res.send(results)
    return next()
  })
}

/**
 * GET /calendar/:height/data handler
 *
 * Expects a path parameter 'height' as an integer
 *
 * Returns dataVal item for calendar block by calendar height
 */
function getCalBlockDataByHeightV1 (req, res, next) {
  let height = parseInt(req.params.height, 10)

  // ensure that :height is an integer
  if (!_.isInteger(height) || height < 0) {
    return next(new restify.InvalidArgumentError('invalid request, height must be a positive integer'))
  }
  cachedCalendarBlock.getBlockByHeight(height, (err, block) => {
    if (err) return next(new restify.InternalError(err))
    if (!block) return next(new restify.NotFoundError())
    res.contentType = 'text/plain'
    res.send(block.dataVal)
    return next()
  })
}

/**
 * GET /calendar/:height/data handler
 *
 * Expects a path parameter 'height' as an integer
 *
 * Returns dataVal item for calendar block by calendar height
 */
function getCalBlockHashByHeightV1 (req, res, next) {
  let height = parseInt(req.params.height, 10)

  // ensure that :height is an integer
  if (!_.isInteger(height) || height < 0) {
    return next(new restify.InvalidArgumentError('invalid request, height must be a positive integer'))
  }

  cachedCalendarBlock.getBlockByHeight(height, (err, block) => {
    if (err) return next(new restify.InternalError(err))
    if (!block) return next(new restify.NotFoundError())
    res.contentType = 'text/plain'
    res.send(block.hash)
    return next()
  })
}

module.exports = {
  getCalBlockByHeightV1: getCalBlockByHeightV1,
  getCalBlockRangeV1: getCalBlockRangeV1,
  getCalBlockDataByHeightV1: getCalBlockDataByHeightV1,
  getCalBlockHashByHeightV1: getCalBlockHashByHeightV1,
  setRedis: (r) => { cachedCalendarBlock.setRedis = r }
}
