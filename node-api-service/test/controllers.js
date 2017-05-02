/* global describe, it */

// test related packages
var expect = require('chai').expect
var request = require('supertest')

var app = require('../server')
var server = app.server

describe('Home Controller', () => {
  describe('GET /', () => {
    it('should return teapot error', (done) => {
      request(server)
        .get('/')
        .expect('Content-type', /json/)
        .expect(418)
        .end((err, res) => {
          if (err) return done(err)
          expect(err).to.equal(null)
          expect(res.body).to.have.property('code')
            .and.to.be.a('string')
            .and.to.equal('ImATeapotError')
          expect(res.body).to.have.property('message')
            .and.to.be.a('string')
            .and.to.equal('This is an API endpoint. Please consult https://chainpoint.org')
          done()
        })
    })
  })
})

describe('Proofs Controller', () => {
  describe('GET /proofs/hash_id', () => {
    it('should return proper error with bad hash_id', (done) => {
      request(server)
        .get('/proofs/badid')
        .set('Content-type', 'text/plain')
        .expect('Content-type', /json/)
        .expect(409)
        .end((err, res) => {
          expect(err).to.equal(null)
          expect(res.body).to.have.property('code')
            .and.to.be.a('string')
            .and.to.equal('InvalidArgument')
          expect(res.body).to.have.property('message')
            .and.to.be.a('string')
            .and.to.equal('invalid request, bad hash_id')
          done()
        })
    })

    it('should return success with valid hash_id', (done) => {
      app.setRedis({
        get: (id, callback) => {
          callback(null, '{ "chainpoint": "proof" }')
        }
      })
      request(server)
        .get('/proofs/d4f0dc90-2f55-11e7-b598-41e628860234')
        .set('Content-type', 'text/plain')
        .expect('Content-type', /json/)
        .expect(200)
        .end((err, res) => {
          expect(err).to.equal(null)
          expect(res.body.length).to.equal(1)
          expect(res.body[0]).to.have.property('hash_id')
            .and.to.be.a('string')
            .and.to.equal('d4f0dc90-2f55-11e7-b598-41e628860234')
          expect(res.body[0]).to.have.property('proof')
          done()
        })
    })
  })

  describe('GET /proofs/', () => {
    it('should return proper error with no hash_id', (done) => {
      request(server)
        .get('/proofs/')
        .set('Content-type', 'text/plain')
        .expect('Content-type', /json/)
        .expect(409)
        .end((err, res) => {
          expect(err).to.equal(null)
          expect(res.body).to.have.property('code')
            .and.to.be.a('string')
            .and.to.equal('InvalidArgument')
          expect(res.body).to.have.property('message')
            .and.to.be.a('string')
            .and.to.equal('invalid request, at least one hash id required')
          done()
        })
    })

    it('should return proper error with too many hashids', (done) => {
      request(server)
        .get('/proofs/')
        .set('Content-type', 'text/plain')
        .set('hashids', 'a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,' +
        'a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,' +
        'a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,' +
        'a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,' +
        'a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,' +
        'a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a,a')
        .expect('Content-type', /json/)
        .expect(409)
        .end((err, res) => {
          expect(err).to.equal(null)
          expect(res.body).to.have.property('code')
            .and.to.be.a('string')
            .and.to.equal('InvalidArgument')
          expect(res.body).to.have.property('message')
            .and.to.be.a('string')
            .and.to.equal('invalid request, too many hash ids (250 max)')
          done()
        })
    })

    it('should return success with one valid hash_id in hashids', (done) => {
      app.setRedis({
        get: (id, callback) => {
          callback(null, '{ "chainpoint": "proof" }')
        }
      })
      request(server)
        .get('/proofs/')
        .set('Content-type', 'text/plain')
        .set('hashids', 'd4f0dc90-2f55-11e7-b598-41e628860234')
        .expect('Content-type', /json/)
        .expect(200)
        .end((err, res) => {
          expect(err).to.equal(null)
          expect(res.body.length).to.equal(1)
          expect(res.body[0]).to.have.property('hash_id')
            .and.to.be.a('string')
            .and.to.equal('d4f0dc90-2f55-11e7-b598-41e628860234')
          expect(res.body[0]).to.have.property('proof')
          done()
        })
    })

    it('should return success with multiple valid hash_ids in hashids', (done) => {
      app.setRedis({
        get: (id, callback) => {
          callback(null, '{ "chainpoint": "proof" }')
        }
      })
      request(server)
        .get('/proofs/')
        .set('Content-type', 'text/plain')
        .set('hashids', 'd4f0dc90-2f55-11e7-b598-41e628860234, d4f0dc90-2f55-11e7-b598-41e628860234')
        .expect('Content-type', /json/)
        .expect(200)
        .end((err, res) => {
          expect(err).to.equal(null)
          expect(res.body.length).to.equal(2)
          expect(res.body[0]).to.have.property('hash_id')
            .and.to.be.a('string')
            .and.to.equal('d4f0dc90-2f55-11e7-b598-41e628860234')
          expect(res.body[0]).to.have.property('proof')
          expect(res.body[1]).to.have.property('hash_id')
            .and.to.be.a('string')
            .and.to.equal('d4f0dc90-2f55-11e7-b598-41e628860234')
          expect(res.body[1]).to.have.property('proof')
          done()
        })
    })
  })
})

describe('Hashes Controller', () => {
  describe('POST /hashes', () => {
    it('should return proper error with invalid content type', (done) => {
      request(server)
        .post('/hashes')
        .set('Content-type', 'text/plain')
        .expect('Content-type', /json/)
        .expect(409)
        .end((err, res) => {
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

    it('should return proper error with missing hashes', (done) => {
      request(server)
        .post('/hashes')
        .send({ name: 'Manny' })
        .expect('Content-type', /json/)
        .expect(409)
        .end((err, res) => {
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

    it('should return proper error with bad hash array', (done) => {
      request(server)
        .post('/hashes')
        .send({ hashes: 'Manny' })
        .expect('Content-type', /json/)
        .expect(409)
        .end((err, res) => {
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

    it('should return proper error with empty hash array', (done) => {
      request(server)
        .post('/hashes')
        .send({ hashes: [] })
        .expect('Content-type', /json/)
        .expect(409)
        .end((err, res) => {
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

    it('should return proper error with too many hashes', (done) => {
      let hashes = []
      for (let x = 0; x < 1100; x++) {
        hashes.push('ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12')
      }

      request(server)
        .post('/hashes')
        .send({ hashes: hashes })
        .expect('Content-type', /json/)
        .expect(409)
        .end((err, res) => {
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

    it('should return proper error with invalid hashes', (done) => {
      request(server)
        .post('/hashes')
        .send({ hashes: ['badhash'] })
        .expect('Content-type', /json/)
        .expect(409)
        .end((err, res) => {
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

    it('should return proper error with no AMQP connection', (done) => {
      request(server)
        .post('/hashes')
        .send({ hashes: ['ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12'] })
        .expect('Content-type', /json/)
        .expect(500)
        .end((err, res) => {
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

    it('should return proper result with on valid call', (done) => {
      app.setAMQPChannel({
        sendToQueue: function () { }
      })
      request(server)
        .post('/hashes')
        .send({ hashes: ['ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12'] })
        .expect('Content-type', /json/)
        .expect(200)
        .end((err, res) => {
          expect(err).to.equal(null)
          expect(res).to.have.property('body')
          expect(res.body).to.have.property('meta')
          expect(res.body.meta).to.have.property('submitted_at')
          expect(res.body.meta).to.have.property('processing_hints')
          expect(res.body.meta.processing_hints).to.have.property('cal')
            .and.to.be.a('string')
          expect(res.body.meta.processing_hints).to.have.property('eth')
            .and.to.be.a('string')
          expect(res.body.meta.processing_hints).to.have.property('btc')
            .and.to.be.a('string')
          expect(res.body).to.have.property('hashes')
            .and.to.be.a('array')
          expect(res.body.hashes.length).to.equal(1)
          expect(res.body.hashes[0]).to.have.property('hash_id')
          expect(res.body.hashes[0]).to.have.property('hash')
            .and.to.equal('ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12')
          done()
        })
    })
  })
})

describe('Functions', () => {
  describe('calling generatePostHashesResponse with one hash', () => {
    it('should return proper repsonse object', (done) => {
      let res = app.generatePostHashesResponse(['ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12'])
      expect(res).to.have.property('meta')
      expect(res.meta).to.have.property('submitted_at')
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

  describe('calling generatePostHashesResponse with three hashes', () => {
    it('should return proper repsonse object', (done) => {
      let res = app.generatePostHashesResponse(['ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12',
        'aa12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12',
        'bb12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12'])
      expect(res).to.have.property('meta')
      expect(res.meta).to.have.property('submitted_at')
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
