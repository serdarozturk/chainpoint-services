/* global describe, it, before, after */

// test related packages
var expect = require('chai').expect
var sinon = require('sinon')
var request = require('supertest')

var amqp = require('amqplib')

var app = require('../server')

// TODO: The following sandbox/before/after worked for callback based usage, but
// doesnt appear to work with the Promise based amqplib used throughout this service.

var sandbox

before(function (done) {
  sandbox = sinon.sandbox.create()
  sandbox.stub(amqp, 'connect').callsArgWithAsync(2, null, {
    createConfirmChannel: function (callback) {
      callback(null, {
        assertExchange: function () { },
        publish: function (exName, replyQ, msg, options) { }
      })
    }
  })
  done()
})

after(function (done) {
  sandbox.restore()
  done()
})

describe('Home Controller', function () {
  describe('GET /', function () {
    it('should return teapot error', function (done) {
      request(app)
        .get('/')
        .expect('Content-type', /json/)
        .expect(418)
        .end(function (err, res) {
          if (err) return done(err)
          expect(err).to.equal(null)
          expect(res.body).to.have.property('code')
            .and.to.be.a('string')
            .and.to.equal('ImATeapotError')
          expect(res.body).to.have.property('message')
            .and.to.be.a('string')
            .and.to.equal('This is an API endpoint. Please consult https://www.chainpoint.org')
          done()
        })
    })
  })
})

describe('Proofs Controller', function () {
  describe('GET /proofs/id', function () {
    // TODO: Add tests when code is complete
  })
})

describe('Hashes Controller', function () {
  describe('POST /hashes', function () {
    it('should return proper error with invalid content type', function (done) {
      request(app)
        .post('/hashes')
        .set('Content-type', 'text/plain')
        .expect('Content-type', /json/)
        .expect(409)
        .end(function (err, res) {
          expect(err).to.equal(null)
          expect(res.body).to.have.property('code')
            .and.to.be.a('string')
            .and.to.equal('InvalidArgument')
          expect(res.body).to.have.property('message')
            .and.to.be.a('string')
            .and.to.equal('invalid content type')
          done()
        })
    })

    it('should return proper error with missing hashes', function (done) {
      request(app)
        .post('/hashes')
        .send({ name: 'Manny' })
        .expect('Content-type', /json/)
        .expect(409)
        .end(function (err, res) {
          expect(err).to.equal(null)
          expect(res.body).to.have.property('code')
            .and.to.be.a('string')
            .and.to.equal('InvalidArgument')
          expect(res.body).to.have.property('message')
            .and.to.be.a('string')
            .and.to.equal('invalid JSON body, missing hashes')
          done()
        })
    })

    it('should return proper error with bad hash array', function (done) {
      request(app)
        .post('/hashes')
        .send({ hashes: 'Manny' })
        .expect('Content-type', /json/)
        .expect(409)
        .end(function (err, res) {
          expect(err).to.equal(null)
          expect(res.body).to.have.property('code')
            .and.to.be.a('string')
            .and.to.equal('InvalidArgument')
          expect(res.body).to.have.property('message')
            .and.to.be.a('string')
            .and.to.equal('invalid JSON body, hashes is not an Array')
          done()
        })
    })

    it('should return proper error with empty hash array', function (done) {
      request(app)
        .post('/hashes')
        .send({ hashes: [] })
        .expect('Content-type', /json/)
        .expect(409)
        .end(function (err, res) {
          expect(err).to.equal(null)
          expect(res.body).to.have.property('code')
            .and.to.be.a('string')
            .and.to.equal('InvalidArgument')
          expect(res.body).to.have.property('message')
            .and.to.be.a('string')
            .and.to.equal('invalid JSON body, hashes Array is empty')
          done()
        })
    })

    it('should return proper error with too many hashes', function (done) {
      let hashes = []
      for (let x = 0; x < 1100; x++) {
        hashes.push('ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12')
      }

      request(app)
        .post('/hashes')
        .send({ hashes: hashes })
        .expect('Content-type', /json/)
        .expect(409)
        .end(function (err, res) {
          expect(err).to.equal(null)
          expect(res.body).to.have.property('code')
            .and.to.be.a('string')
            .and.to.equal('InvalidArgument')
          expect(res.body).to.have.property('message')
            .and.to.be.a('string')
            .and.to.equal('invalid JSON body, hashes Array max size exceeded')
          done()
        })
    })

    it('should return proper error with invalid hashes', function (done) {
      request(app)
        .post('/hashes')
        .send({ hashes: ['badhash'] })
        .expect('Content-type', /json/)
        .expect(409)
        .end(function (err, res) {
          expect(err).to.equal(null)
          expect(res.body).to.have.property('code')
            .and.to.be.a('string')
            .and.to.equal('InvalidArgument')
          expect(res.body).to.have.property('message')
            .and.to.be.a('string')
            .and.to.equal('invalid JSON body, invalid hashes present')
          done()
        })
    })

    it('should return proper error with no AMQP connection', function (done) {
      request(app)
        .post('/hashes')
        .send({ hashes: ['ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12'] })
        .expect('Content-type', /json/)
        .expect(500)
        .end(function (err, res) {
          expect(err).to.equal(null)
          expect(res.body).to.have.property('code')
            .and.to.be.a('string')
            .and.to.equal('InternalServerError')
          expect(res.body).to.have.property('message')
            .and.to.be.a('string')
            .and.to.equal('Message could not be delivered')
          done()
        })
    })

    /* TODO: Can this test pass with an AMQP variable check the way it is? Possibly not.

    it('should return proper response with valid request', function (done) {
      request(app)
        .post('/hashes')
        .send({ hashes: ['ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12'] })
        .expect('Content-type', /json/)
        .expect(200)
        .end(function (err, res) {
          expect(err).to.equal(null)
          expect(res.body).to.have.property('meta')
          expect(res.body.meta).to.have.property('timestamp')
          expect(res.body.meta).to.have.property('processing_hints')
          expect(res.body.meta.processing_hints).to.have.property('cal')
            .and.to.be.a('date')
          expect(res.body.meta.processing_hints).to.have.property('eth')
            .and.to.be.a('date')
          expect(res.body.meta.processing_hints).to.have.property('btc')
            .and.to.be.a('date')
          expect(res.body).to.have.property('hashes')
            .and.to.be.a('array')
          expect(res.body.hashes.length).to.equal(1)
          expect(res.body.hashes[0]).to.have.property('hash_id')
          expect(res.body.hashes[0]).to.have.property('hash')
            .and.to.equal('ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab1212')
          done()
        })
    })
    */
  })
})
