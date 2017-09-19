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
const calendarBlock = require('../models/CalendarBlock.js')

// pull in variables defined in shared CalendarBlock module
let sequelize = calendarBlock.sequelize
let CalendarBlock = calendarBlock.CalendarBlock

/**
 * GET /calendar/:height handler
 *
 * Expects a path parameter 'height' as an integer
 *
 * Returns a calendar block by calendar height
 */
async function getCalBlockByHeightV1Async (req, res, next) {
  let height = parseInt(req.params.height, 10)

  // ensure that :height is an integer
  if (!_.isInteger(height) || height < 0) {
    return next(new restify.InvalidArgumentError('invalid request, height must be a positive integer'))
  }
  let block
  try {
    block = await CalendarBlock.findOne({ where: { id: height } })
  } catch (error) {
    return next(new restify.InternalError(error.message))
  }
  if (!block) return next(new restify.NotFoundError())
  block = block.get({ plain: true })
  res.contentType = 'application/json'
  block.id = parseInt(block.id, 10)
  block.time = parseInt(block.time, 10)
  block.version = parseInt(block.version, 10)
  res.send(block)
  return next()
}

/**
 * GET /calendar/:fromHeight/:toHeight handler
 *
 * Expects path parameters 'fromHeight' and 'topHeight' as an integers
 *
 * Returns an array of calendar blocks
 */
async function getCalBlockRangeV1Async (req, res, next) {
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

  let blocks
  try {
    blocks = await CalendarBlock.findAll({ where: { id: { $between: [fromHeight, toHeight] } }, order: [['id', 'ASC']] })
  } catch (error) {
    return next(new restify.InternalError(error.message))
  }
  for (let x = 0; x < blocks.length; x++) {
    blocks[x] = blocks[x].get({ plain: true })
  }
  if (!blocks || blocks.length === 0) blocks = []
  // convert requisite fields to integers
  for (let x = 0; x < blocks.length; x++) {
    blocks[x].id = parseInt(blocks[x].id, 10)
    blocks[x].time = parseInt(blocks[x].time, 10)
    blocks[x].version = parseInt(blocks[x].version, 10)
  }
  let results = {}
  results.blocks = blocks
  res.send(results)
  return next()
}

/**
 * GET /calendar/:height/data handler
 *
 * Expects a path parameter 'height' as an integer
 *
 * Returns dataVal item for calendar block by calendar height
 */
async function getCalBlockDataByHeightV1Async (req, res, next) {
  let height = parseInt(req.params.height, 10)

  // ensure that :height is an integer
  if (!_.isInteger(height) || height < 0) {
    return next(new restify.InvalidArgumentError('invalid request, height must be a positive integer'))
  }
  let block
  try {
    block = await CalendarBlock.findOne({ where: { id: height } })
  } catch (error) {
    return next(new restify.InternalError(error.message))
  }
  if (!block) return next(new restify.NotFoundError())
  block = block.get({ plain: true })
  res.contentType = 'text/plain'
  res.send(block.dataVal)
  return next()
}

/**
 * GET /calendar/:height/data handler
 *
 * Expects a path parameter 'height' as an integer
 *
 * Returns dataVal item for calendar block by calendar height
 */
async function getCalBlockHashByHeightV1Async (req, res, next) {
  let height = parseInt(req.params.height, 10)

  // ensure that :height is an integer
  if (!_.isInteger(height) || height < 0) {
    return next(new restify.InvalidArgumentError('invalid request, height must be a positive integer'))
  }
  let block
  try {
    block = await CalendarBlock.findOne({ where: { id: height } })
  } catch (error) {
    return next(new restify.InternalError(error.message))
  }
  if (!block) return next(new restify.NotFoundError())
  block = block.get({ plain: true })
  res.contentType = 'text/plain'
  res.send(block.hash)
  return next()
}

module.exports = {
  getCalendarBlockSequelize: () => { return sequelize },
  getCalBlockByHeightV1Async: getCalBlockByHeightV1Async,
  getCalBlockRangeV1Async: getCalBlockRangeV1Async,
  getCalBlockDataByHeightV1Async: getCalBlockDataByHeightV1Async,
  getCalBlockHashByHeightV1Async: getCalBlockHashByHeightV1Async
}
