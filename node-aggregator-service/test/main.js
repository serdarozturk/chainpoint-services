/* global describe, it */

// test related packages
var expect = require('chai').expect

var server = require('../server')

describe('Consume Hash Messages', function () {
  it('should do nothing with null message', function (done) {
    server.setHASHES([])
    let msg = null
    server.consumeHashMessage(msg)
    let hashes = server.getHASHES()
    expect(hashes.length).to.equal(0)
    done()
  })

  it('should generate one state object with a one hash message', function (done) {
    server.setHASHES([])
    let msg = {}
    msg.content = new Buffer(JSON.stringify({
      'hash_id': '6d627180-1883-11e7-a8f9-edb8c212ef23',
      'hash': 'ed10960ccc613e4ad0533a813e2027924afd051f5065bb5379a80337c69afcb4'
    }))
    server.consumeHashMessage(msg)
    let hashes = server.getHASHES()
    expect(hashes.length).to.equal(1)
    expect(hashes[0]).to.have.property('hash_id')
      .and.to.equal('6d627180-1883-11e7-a8f9-edb8c212ef23')
    expect(hashes[0]).to.have.property('hash')
      .and.to.equal('ed10960ccc613e4ad0533a813e2027924afd051f5065bb5379a80337c69afcb4')
    expect(hashes[0]).to.have.property('msg')
      .and.to.equal(msg)
    done()
  })
})

describe('Aggregate', function () {
  it('should do nothing with empty hashes', function (done) {
    server.setAMQPChannel({})
    server.setHASHES([])
    server.setTREES([])
    server.aggregate()
    let hashes = server.getHASHES()
    let trees = server.getTREES()
    expect(hashes.length).to.equal(0)
    expect(trees.length).to.equal(0)
    done()
  })

  it('should create one leaf tree with one hash', function (done) {
    server.setAMQPChannel({})
    let msg = {}
    msg.content = new Buffer(JSON.stringify({
      'hash_id': '6d627180-1883-11e7-a8f9-edb8c212ef23',
      'hash': 'ed10960ccc613e4ad0533a813e2027924afd051f5065bb5379a80337c69afcb4'
    }))
    let hashObj = {
      'hash_id': '6d627180-1883-11e7-a8f9-edb8c212ef23',
      'hash': 'ed10960ccc613e4ad0533a813e2027924afd051f5065bb5379a80337c69afcb4',
      'msg': msg
    }
    server.setHASHES([hashObj])
    server.setTREES([])
    server.aggregate()
    let hashes = server.getHASHES()
    let trees = server.getTREES()
    expect(hashes.length).to.equal(0)
    expect(trees.length).to.equal(1)
    expect(trees[0]).has.property('root').and.is.a('string')
    expect(trees[0]).has.property('proofData').and.is.a('array')
    expect(trees[0].proofData.length).to.equal(1)
    expect(trees[0].proofData[0]).has.property('hash_id').and.is.a('string')
      .and.to.equal('6d627180-1883-11e7-a8f9-edb8c212ef23')
    expect(trees[0].proofData[0]).has.property('hash_msg')
    expect(trees[0].proofData[0]).has.property('proof').and.is.a('array')
    expect(trees[0].proofData[0].proof.length).to.equal(1)
    done()
  })

  it('should create three leaf tree with three hashes', function (done) {
    server.setAMQPChannel({})
    let msg1 = {}
    msg1.content = new Buffer(JSON.stringify({
      'hash_id': '6d627180-1883-11e7-a8f9-edb8c212ef23',
      'hash': 'ed10960ccc613e4ad0533a813e2027924afd051f5065bb5379a80337c69afcb4'
    }))
    let hashObj1 = {
      'hash_id': '6d627180-1883-11e7-a8f9-edb8c212ef23',
      'hash': 'ed10960ccc613e4ad0533a813e2027924afd051f5065bb5379a80337c69afcb4',
      'msg': msg1
    }
    let msg2 = {}
    msg2.content = new Buffer(JSON.stringify({
      'hash_id': '22627180-1883-11e7-a8f9-edb8c212ef23',
      'hash': '2210960ccc613e4ad0533a813e2027924afd051f5065bb5379a80337c69afcb4'
    }))
    let hashObj2 = {
      'hash_id': '22627180-1883-11e7-a8f9-edb8c212ef23',
      'hash': '2210960ccc613e4ad0533a813e2027924afd051f5065bb5379a80337c69afcb4',
      'msg': msg2
    }
    let msg3 = {}
    msg3.content = new Buffer(JSON.stringify({
      'hash_id': '33627180-1883-11e7-a8f9-edb8c212ef23',
      'hash': '3310960ccc613e4ad0533a813e2027924afd051f5065bb5379a80337c69afcb4'
    }))
    let hashObj3 = {
      'hash_id': '33627180-1883-11e7-a8f9-edb8c212ef23',
      'hash': '3310960ccc613e4ad0533a813e2027924afd051f5065bb5379a80337c69afcb4',
      'msg': msg3
    }
    server.setHASHES([hashObj1, hashObj2, hashObj3])
    server.setTREES([])
    server.aggregate()
    let hashes = server.getHASHES()
    let trees = server.getTREES()
    expect(hashes.length).to.equal(0)
    expect(trees.length).to.equal(1)
    expect(trees[0]).has.property('root').and.is.a('string')
    expect(trees[0]).has.property('proofData').and.is.a('array')
    expect(trees[0].proofData.length).to.equal(3)
    expect(trees[0].proofData[0]).has.property('hash_id').and.is.a('string')
      .and.to.equal('6d627180-1883-11e7-a8f9-edb8c212ef23')
    expect(trees[0].proofData[0]).has.property('hash_msg')
    expect(trees[0].proofData[0]).has.property('proof').and.is.a('array')
    expect(trees[0].proofData[0].proof.length).to.equal(3)
    expect(trees[0].proofData[1]).has.property('hash_id').and.is.a('string')
      .and.to.equal('22627180-1883-11e7-a8f9-edb8c212ef23')
    expect(trees[0].proofData[1]).has.property('hash_msg')
    expect(trees[0].proofData[1]).has.property('proof').and.is.a('array')
    expect(trees[0].proofData[1].proof.length).to.equal(3)
    expect(trees[0].proofData[2]).has.property('hash_id').and.is.a('string')
      .and.to.equal('33627180-1883-11e7-a8f9-edb8c212ef23')
    expect(trees[0].proofData[2]).has.property('hash_msg')
    expect(trees[0].proofData[2]).has.property('proof').and.is.a('array')
    expect(trees[0].proofData[2].proof.length).to.equal(2)
    done()
  })
})

describe('Finalize', function () {
  it('should do nothing with null amqpChannel', function (done) {
    server.setAMQPChannel(null)
    server.setHASHES([1])
    server.setTREES([1])
    server.finalize()
    let hashes = server.getHASHES()
    let trees = server.getTREES()
    expect(hashes.length).to.equal(1)
    expect(trees.length).to.equal(1)
    done()
  })

  it('should do nothing with empty TREES', function (done) {
    server.setAMQPChannel({})
    server.setHASHES([1])
    server.setTREES([])
    server.finalize()
    let hashes = server.getHASHES()
    let trees = server.getTREES()
    expect(hashes.length).to.equal(1)
    expect(trees.length).to.equal(0)
    done()
  })

  it('should create one state object message for one tree with one proof', function (done) {
    server.setAMQPChannel({
      publish: function (ex, key, message, opt) {
        this.results.push(JSON.parse(message.toString()))
      },
      results: []
    })
    server.setHASHES([1])
    let treeObj1 = {
      root: 'root1',
      proofData: [
        {
          'hash_id': 'id1',
          'hash_msg': 'msg1',
          'proof': [
            { 'left': 'ab1234' }
          ]
        }
      ]
    }
    server.setTREES([treeObj1])
    server.finalize()
    let hashes = server.getHASHES()
    let trees = server.getTREES()
    expect(hashes.length).to.equal(1)
    expect(trees.length).to.equal(0)
    let chan = server.getAMQPChannel()
    expect(chan).to.have.property('results')
    expect(chan.results).to.be.a('array')
    expect(chan.results.length).to.equal(1)
    expect(chan.results[0]).to.have.property('hash_id')
      .and.to.be.a('string')
      .and.to.equal('id1')
    expect(chan.results[0]).to.have.property('state')
    expect(chan.results[0].state).to.have.property('ops')
      .and.to.be.a('array')
    expect(chan.results[0].state.ops.length).to.equal(1)
    expect(chan.results[0]).to.have.property('value')
      .and.to.be.a('string')
      .and.to.equal('root1')
    done()
  })

  it('should create two state object messages for one tree with two proofs', function (done) {
    server.setAMQPChannel({
      publish: function (ex, key, message, opt) {
        this.results.push(JSON.parse(message.toString()))
      },
      results: []
    })
    server.setHASHES([1])
    let treeObj1 = {
      root: 'root1',
      proofData: [
        {
          'hash_id': 'id1',
          'hash_msg': 'msg1',
          'proof': [
            { 'left': 'ab1234' }
          ]
        },
        {
          'hash_id': 'id2',
          'hash_msg': 'msg2',
          'proof': [
            { 'left': 'ab2222' }
          ]
        }
      ]
    }
    server.setTREES([treeObj1])
    server.finalize()
    let hashes = server.getHASHES()
    let trees = server.getTREES()
    expect(hashes.length).to.equal(1)
    expect(trees.length).to.equal(0)
    let chan = server.getAMQPChannel()
    expect(chan).to.have.property('results')
    expect(chan.results).to.be.a('array')
    expect(chan.results.length).to.equal(2)
    expect(chan.results[0]).to.have.property('hash_id')
      .and.to.be.a('string')
      .and.to.equal('id1')
    expect(chan.results[0]).to.have.property('state')
    expect(chan.results[0].state).to.have.property('ops')
      .and.to.be.a('array')
    expect(chan.results[0].state.ops.length).to.equal(1)
    expect(chan.results[0]).to.have.property('value')
      .and.to.be.a('string')
      .and.to.equal('root1')
    expect(chan.results[1]).to.have.property('hash_id')
      .and.to.be.a('string')
      .and.to.equal('id2')
    expect(chan.results[1]).to.have.property('state')
    expect(chan.results[1].state).to.have.property('ops')
      .and.to.be.a('array')
    expect(chan.results[1].state.ops.length).to.equal(1)
    expect(chan.results[1]).to.have.property('value')
      .and.to.be.a('string')
      .and.to.equal('root1')
    done()
  })

  it('should create two state object messages for two trees with one proof each', function (done) {
    server.setAMQPChannel({
      publish: function (ex, key, message, opt) {
        this.results.push(JSON.parse(message.toString()))
      },
      results: []
    })
    server.setHASHES([1])
    let treeObj1 = {
      root: 'root1',
      proofData: [
        {
          'hash_id': 'id1',
          'hash_msg': 'msg1',
          'proof': [
            { 'left': 'ab1234' }
          ]
        }
      ]
    }
    let treeObj2 = {
      root: 'root2',
      proofData: [
        {
          'hash_id': 'id2',
          'hash_msg': 'msg2',
          'proof': [
            { 'left': 'ab2222' }
          ]
        }
      ]
    }
    server.setTREES([treeObj1, treeObj2])
    server.finalize()
    let hashes = server.getHASHES()
    let trees = server.getTREES()
    expect(hashes.length).to.equal(1)
    expect(trees.length).to.equal(0)
    let chan = server.getAMQPChannel()
    expect(chan).to.have.property('results')
    expect(chan.results).to.be.a('array')
    expect(chan.results.length).to.equal(2)
    expect(chan.results[0]).to.have.property('hash_id')
      .and.to.be.a('string')
      .and.to.equal('id1')
    expect(chan.results[0]).to.have.property('state')
    expect(chan.results[0].state).to.have.property('ops')
      .and.to.be.a('array')
    expect(chan.results[0].state.ops.length).to.equal(1)
    expect(chan.results[0]).to.have.property('value')
      .and.to.be.a('string')
      .and.to.equal('root1')
    expect(chan.results[1]).to.have.property('hash_id')
      .and.to.be.a('string')
      .and.to.equal('id2')
    expect(chan.results[1]).to.have.property('state')
    expect(chan.results[1].state).to.have.property('ops')
      .and.to.be.a('array')
    expect(chan.results[1].state.ops.length).to.equal(1)
    expect(chan.results[1]).to.have.property('value')
      .and.to.be.a('string')
      .and.to.equal('root2')
    done()
  })

  it('should create four state object messages for two trees with two proofs each', function (done) {
    server.setAMQPChannel({
      publish: function (ex, key, message, opt) {
        this.results.push(JSON.parse(message.toString()))
      },
      results: []
    })
    server.setHASHES([1])
    let treeObj1 = {
      root: 'root1',
      proofData: [
        {
          'hash_id': 'id1',
          'hash_msg': 'msg1',
          'proof': [
            { 'left': 'ab1234' }
          ]
        },
        {
          'hash_id': 'id1b',
          'hash_msg': 'msg1b',
          'proof': [
            { 'left': 'bb1234' }
          ]
        }
      ]
    }
    let treeObj2 = {
      root: 'root2',
      proofData: [
        {
          'hash_id': 'id2',
          'hash_msg': 'msg2',
          'proof': [
            { 'left': 'ab2222' }
          ]
        },
        {
          'hash_id': 'id2b',
          'hash_msg': 'msg2b',
          'proof': [
            { 'left': 'bb2222' }
          ]
        }
      ]
    }
    server.setTREES([treeObj1, treeObj2])
    server.finalize()
    let hashes = server.getHASHES()
    let trees = server.getTREES()
    expect(hashes.length).to.equal(1)
    expect(trees.length).to.equal(0)
    let chan = server.getAMQPChannel()
    expect(chan).to.have.property('results')
    expect(chan.results).to.be.a('array')
    expect(chan.results.length).to.equal(4)
    expect(chan.results[0]).to.have.property('hash_id')
      .and.to.be.a('string')
      .and.to.equal('id1')
    expect(chan.results[0]).to.have.property('state')
    expect(chan.results[0].state).to.have.property('ops')
      .and.to.be.a('array')
    expect(chan.results[0].state.ops.length).to.equal(1)
    expect(chan.results[0]).to.have.property('value')
      .and.to.be.a('string')
      .and.to.equal('root1')
    expect(chan.results[1]).to.have.property('hash_id')
      .and.to.be.a('string')
      .and.to.equal('id1b')
    expect(chan.results[1]).to.have.property('state')
    expect(chan.results[1].state).to.have.property('ops')
      .and.to.be.a('array')
    expect(chan.results[1].state.ops.length).to.equal(1)
    expect(chan.results[1]).to.have.property('value')
      .and.to.be.a('string')
      .and.to.equal('root1')
    expect(chan.results[2]).to.have.property('hash_id')
      .and.to.be.a('string')
      .and.to.equal('id2')
    expect(chan.results[2]).to.have.property('state')
    expect(chan.results[2].state).to.have.property('ops')
      .and.to.be.a('array')
    expect(chan.results[2].state.ops.length).to.equal(1)
    expect(chan.results[2]).to.have.property('value')
      .and.to.be.a('string')
      .and.to.equal('root2')
    expect(chan.results[3]).to.have.property('hash_id')
      .and.to.be.a('string')
      .and.to.equal('id2b')
    expect(chan.results[3]).to.have.property('state')
    expect(chan.results[3].state).to.have.property('ops')
      .and.to.be.a('array')
    expect(chan.results[3].state.ops.length).to.equal(1)
    expect(chan.results[3]).to.have.property('value')
      .and.to.be.a('string')
      .and.to.equal('root2')
    done()
  })
})
