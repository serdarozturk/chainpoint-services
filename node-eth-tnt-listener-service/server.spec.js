/* global describe, it */
var server = require('./server.js')
var assert = require('assert')

describe('Server', function () {
  describe('isNewEventOlder', function () {
    it('should return true if they are equal', function () {
      let info = {
        blockNumber: 100,
        transactionIndex: 100
      }
      assert.equal(server.isNewEventOlder(info, info), true)
    })

    it('should return true if the block is later', function () {
      let latest = {
        blockNumber: 100,
        transactionIndex: 100
      }

      let newEvent = {
        blockNumber: 101,
        transactionIndex: 100
      }

      assert.equal(server.isNewEventOlder(latest, newEvent), true)
    })

    it('should return false if the block is newer', function () {
      let latest = {
        blockNumber: 80,
        transactionIndex: 100
      }

      let newEvent = {
        blockNumber: 101,
        transactionIndex: 100
      }

      assert.equal(server.isNewEventOlder(latest, newEvent), false)
    })

    it('should return false if the block is same but tx ID is newer', function () {
      let latest = {
        blockNumber: 80,
        transactionIndex: 100
      }

      let newEvent = {
        blockNumber: 80,
        transactionIndex: 101
      }

      assert.equal(server.isNewEventOlder(latest, newEvent), false)
    })

    it('should return true if the block is same but tx ID is older', function () {
      let latest = {
        blockNumber: 80,
        transactionIndex: 102
      }

      let newEvent = {
        blockNumber: 80,
        transactionIndex: 101
      }

      assert.equal(server.isNewEventOlder(latest, newEvent), true)
    })
  })
})
