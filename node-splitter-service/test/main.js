/* global describe, it */

// test related packages
var expect = require('chai').expect

var server = require('../server')

describe('Consume Hash Messages', function () {
  it('should do nothing with null message', function (done) {
    let chan = {
      publish: function (ex, key, message, opt) {
        this.results.push(JSON.parse(message.toString()))
      },
      results: []
    }
    let msg = null
    server.consumeHashMessage(chan, msg)
    expect(chan).to.have.property('results')
    expect(chan.results.length).to.equal(0)
    done()
  })

  it('should generate one state object with a one hash message', function (done) {
    let chan = {
      publish: function (ex, key, message, opt) {
        this.results.push(JSON.parse(message.toString()))
      },
      results: []
    }
    let msg = {}
    msg.content = new Buffer(JSON.stringify({
      hashes: [
        {
          'hash_id': '6d627180-1883-11e7-a8f9-edb8c212ef23',
          'hash': 'ed10960ccc613e4ad0533a813e2027924afd051f5065bb5379a80337c69afcb4'
        }
      ]
    }))
    server.consumeHashMessage(chan, msg)
    expect(chan).to.have.property('results')
    expect(chan.results.length).to.equal(1)
    expect(chan.results[0]).to.have.property('hash_id')
      .and.to.equal('6d627180-1883-11e7-a8f9-edb8c212ef23')
    expect(chan.results[0]).to.have.property('state')
    expect(chan.results[0].state).to.have.property('hash')
      .and.to.equal('ed10960ccc613e4ad0533a813e2027924afd051f5065bb5379a80337c69afcb4')
    done()
  })

  it('should generate three state objects with a three hash messages', function (done) {
    let chan = {
      publish: function (ex, key, message, opt) {
        this.results.push(JSON.parse(message.toString()))
      },
      results: []
    }
    let msg = {}
    msg.content = new Buffer(JSON.stringify({
      hashes: [
        {
          'hash_id': '6d627180-1883-11e7-a8f9-edb8c212ef23',
          'hash': 'ed10960ccc613e4ad0533a813e2027924afd051f5065bb5379a80337c69afcb4'
        },
        {
          'hash_id': 'aa627180-1883-11e7-a8f9-edb8c212ef23',
          'hash': 'aa10960ccc613e4ad0533a813e2027924afd051f5065bb5379a80337c69afcb4'
        },
        {
          'hash_id': 'bb627180-1883-11e7-a8f9-edb8c212ef23',
          'hash': 'bb10960ccc613e4ad0533a813e2027924afd051f5065bb5379a80337c69afcb4'
        }
      ]
    }))
    server.consumeHashMessage(chan, msg)
    expect(chan).to.have.property('results')
    expect(chan.results.length).to.equal(3)
    expect(chan.results[0]).to.have.property('hash_id')
      .and.to.equal('6d627180-1883-11e7-a8f9-edb8c212ef23')
    expect(chan.results[0]).to.have.property('state')
    expect(chan.results[0].state).to.have.property('hash')
      .and.to.equal('ed10960ccc613e4ad0533a813e2027924afd051f5065bb5379a80337c69afcb4')
    expect(chan.results[1]).to.have.property('hash_id')
      .and.to.equal('aa627180-1883-11e7-a8f9-edb8c212ef23')
    expect(chan.results[1]).to.have.property('state')
    expect(chan.results[1].state).to.have.property('hash')
      .and.to.equal('aa10960ccc613e4ad0533a813e2027924afd051f5065bb5379a80337c69afcb4')
    expect(chan.results[2]).to.have.property('hash_id')
      .and.to.equal('bb627180-1883-11e7-a8f9-edb8c212ef23')
    expect(chan.results[2]).to.have.property('state')
    expect(chan.results[2].state).to.have.property('hash')
      .and.to.equal('bb10960ccc613e4ad0533a813e2027924afd051f5065bb5379a80337c69afcb4')
    done()
  })
})
