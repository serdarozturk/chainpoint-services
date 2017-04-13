/* global describe, it */

// test related packages
var expect = require('chai').expect
var request = require('supertest')

var app = require('../server')
var server = app.server

describe('Home Controller', function () {
  describe('GET /', function () {
    it('should return teapot error', function (done) {
      request(server)
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
      request(server)
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
      request(server)
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
      request(server)
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
      request(server)
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

      request(server)
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
      request(server)
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
      request(server)
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
  })
})

describe('Functions', function () {
  describe('calling generatePostHashesResponse with one hash', function () {
    it('should return proper repsonse object', function (done) {
      let res = app.generatePostHashesResponse(['ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12'])
      expect(res).to.have.property('meta')
      expect(res.meta).to.have.property('timestamp')
      expect(res.meta).to.have.property('processing_hints')
      expect(res.meta.processing_hints).to.have.property('cal')
        .and.to.be.a('string')
      expect(res.meta.processing_hints).to.have.property('eth')
        .and.to.be.a('string')
      expect(res.meta.processing_hints).to.have.property('btc')
        .and.to.be.a('string')
      expect(res).to.have.property('hashes')
        .and.to.be.a('array')
      expect(res.hashes.length).to.equal(1)
      expect(res.hashes[0]).to.have.property('hash_id')
      expect(res.hashes[0]).to.have.property('hash')
        .and.to.equal('ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12')
      done()
    })
  })


  describe('calling generatePostHashesResponse with three hashes', function () {
    it('should return proper repsonse object', function (done) {
      let res = app.generatePostHashesResponse(['ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12',
        'aa12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12',
        'bb12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12'])
      expect(res).to.have.property('meta')
      expect(res.meta).to.have.property('timestamp')
      expect(res.meta).to.have.property('processing_hints')
      expect(res.meta.processing_hints).to.have.property('cal')
        .and.to.be.a('string')
      expect(res.meta.processing_hints).to.have.property('eth')
        .and.to.be.a('string')
      expect(res.meta.processing_hints).to.have.property('btc')
        .and.to.be.a('string')
      expect(res).to.have.property('hashes')
        .and.to.be.a('array')
      expect(res.hashes.length).to.equal(3)
      expect(res.hashes[0]).to.have.property('hash_id')
      expect(res.hashes[0]).to.have.property('hash')
        .and.to.equal('ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12')
      expect(res.hashes[1]).to.have.property('hash_id')
      expect(res.hashes[1]).to.have.property('hash')
        .and.to.equal('aa12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12')
      expect(res.hashes[2]).to.have.property('hash_id')
      expect(res.hashes[2]).to.have.property('hash')
        .and.to.equal('bb12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12')
      done()
    })
  })
})
