const _ = require('lodash')
const crypto = require('crypto')
const request = require('superagent')
const redisLib = require('redis')
const uuidTime = require('uuid-time')
const cpb = require('chainpoint-binary')
const chainpointParse = require('chainpoint-parse')
const async = require('async')
const dns = require('dns')
var jmespath = require('jmespath')

const Html5WebSocket = require('html5-websocket')
const ReconnectingWebSocket = require('reconnecting-websocket')

const wsOptions = {
  constructor: Html5WebSocket,
  maxReconnectionDelay: 10000,
  minReconnectionDelay: 1500,
  reconnectionDelayGrowFactor: 1.3,
  connectionTimeout: 4000,
  maxRetries: Infinity,
  debug: false
}

// FIXME
// - resurrect websocket cnxn if dropped when trying to send
// - connect to /ws only
// - send ws messages with a tag to inidicate API purpose
// - pick server to send to randomly from available DNS TXT
// - pick server to verify from randomly from available DNS TXT
// - fix swagger metadata
// - add swagger descriptions
// - add swagger WS docs
// - send only failed output to stderr, otherwise run silent
// - redis connection string from env and reconnect code

const SEND_HASH_INTERVAL_MSEC = 1000
const MS_IN_DAY = 1000 * 60 * 60 * 24

let redis = redisLib.createClient()

// Setup the redis structures for each hash to track metrics.
let initStoredHash = (hash, sentAt, hashID) => {
  // create a redis capped list as an index of each SHA256 submitted
  redis.lpush('hashlist', hash)

  // keep 32 days of hashes timing data
  redis.ltrim('hashlist', 0, (MS_IN_DAY / SEND_HASH_INTERVAL_MSEC) * 32)

  // create a redis hash for each SHA256 with initial tracking metadata
  let hashKey = ['hash', hash].join(':')
  let d = new Date()
  redis.hmset(hashKey, ['sentAt', sentAt, 'hashID', hashID, 'hashIDTime', uuidTime.v1(hashID)])
}

// Pick a random host from DNS TXT records for clients
// open a WS connection to that host, and setup an
// event listener which contains the code to submit hashes
// periodically.
async.waterfall([
  (callback) => {
    dns.resolveTxt('_cli.addr.chainpoint.org', (err, addr) => {
      if (err) {
        console.error(err)
      }

      if (addr && addr[0] && addr[0][0]) {
        let shuffledAddr = _.shuffle(_.clone(addr))
        let dnsRandomAddr = shuffledAddr[0][0]
        callback(null, dnsRandomAddr)
      } else {
        callback(null, 'c.chainpoint.org')
      }
    })
  },
  function (host, callback) {
    let rws = new ReconnectingWebSocket('ws://' + host, null, wsOptions)
    callback(null, host, rws)
  }
], (err, host, rws) => {
  if (err) {
    console.error(err)
  }

  rws.addEventListener('open', () => {
    setInterval(() => {
      let d = new Date()
      let newHash = crypto.createHash('sha256').update(d.toISOString()).digest('hex')

      request
      .post(host + '/hashes')
      .send({ hashes: [newHash] })
      .set('Content-Type', 'application/json')
      .end(function (err, res) {
        if (err || !res.ok) {
          console.error('Error submitting hash : ', err)
        } else {
          let sentAt = d.getTime()
          let hashID = res.body.hashes[0].hash_id
          initStoredHash(newHash, sentAt, hashID)
          // console.log(hashID)
          // Subscribe to proof updates for hashID.
          rws.send(hashID)
        }
      })
    }, SEND_HASH_INTERVAL_MSEC)
  })

  rws.onmessage = (event) => {
    let jsonData = JSON.parse(event.data)
    let proofObj = cpb.binaryToObjectSync(jsonData.proof)

    async.parallel({
      // set hash property
      hash: (callback) => {
        if (_.hasIn(proofObj, 'hash')) {
          callback(null, proofObj.hash)
        }
      },
      // set hashID property
      hashID: (callback) => {
        if (_.hasIn(proofObj, 'hash_id')) {
          callback(null, proofObj.hash_id)
        }
      },
      // calculate the delay between hash submit and first cal proof
      hashProofDelayMS: (callback) => {
        if (_.hasIn(proofObj, 'hash_id')) {
          let hashIDTime = uuidTime.v1(proofObj.hash_id)
          callback(null, _.now() - hashIDTime)
        }
      },
      // Does the proof from the GET /proofs endpoint match the WS proof?
      proofMatched: (callback) => {
        request
        .get(host + '/proofs/' + proofObj.hash_id)
        .timeout(5000)
        .end(function (err, res) {
          if (err || !res.ok) {
            console.error(err)
            callback(null, false)
          } else if (_.hasIn(res, 'body[0].proof') && _.isEqual(proofObj, res.body[0].proof)) {
            callback(null, true)
          } else {
            callback(null, false)
          }
        })
      },
      // Does the proof pass verification from POST /verify endpoint?
      proofVerified: (callback) => {
        request
        .post(host + '/verify')
        .send({ proofs: [proofObj] })
        .set('Content-Type', 'application/json')
        .timeout(5000)
        .end(function (err, res) {
          if (err || !res.ok) {
            console.error(err)
            callback(null, false)
          } else if (_.hasIn(res, 'body[0].status') && res.body[0].status === 'verified') {
            // console.log(JSON.stringify(res.body))
            callback(null, true)
          } else {
            callback(null, false)
          }
        })
      },
      // Does the /calendar API return the calculated Merkle root for a 'cal' anchor?
      anchorMatchCAL: (callback) => {
        chainpointParse.parseObject(proofObj, function (err, result) {
          if (err) {
            console.error(err)
            callback(null, false)
          } else {
            let [anchorURI, anchorHash] = jmespath.search(result, "branches[*].anchors[?type=='cal'].[uris, expected_value][][][]")

            if (anchorURI && anchorHash) {
              request
                .get(anchorURI)
                .timeout(5000)
                .end(function (err, res) {
                  if (err || !res.ok) {
                    console.error(err)
                    callback(null, false)
                  } else if (res.text === anchorHash) { // GET /calendar/:height/hash returns text/plain
                    callback(null, true)
                  } else {
                    callback(null, false)
                  }
                })
            } else {
              callback(null, false)
            }
          }
        })
      },
      // Does the /calendar API return the calculated Merkle root for a 'btc' anchor?
      anchorMatchBTC: (callback) => {
        chainpointParse.parseObject(proofObj, function (err, result) {
          if (err) {
            console.error(err)
            callback(null, false)
          } else {
            let [anchorURI, anchorHash] = jmespath.search(result, "branches[*].anchors[?type=='btc'].[uris, expected_value][][][]")

            if (anchorURI && anchorHash) {
              request
                .get(anchorURI)
                .timeout(5000)
                .end(function (err, res) {
                  if (err || !res.ok) {
                    console.error(err)
                    callback(null, false)
                  } else if (res.text === anchorHash) { // GET /calendar/:height/hash returns text/plain
                    callback(null, true)
                  } else {
                    callback(null, false)
                  }
                })
            } else {
              callback(null, false)
            }
          }
        })
      },
      // Does the /calendar API return the calculated Merkle root for a 'eth' anchor?
      anchorMatchETH: (callback) => {
        chainpointParse.parseObject(proofObj, function (err, result) {
          if (err) {
            console.error(err)
            callback(null, false)
          } else {
            let [anchorURI, anchorHash] = jmespath.search(result, "branches[*].anchors[?type=='btc'].[uris, expected_value][][][]")

            if (anchorURI && anchorHash) {
              request
                .get(anchorURI)
                .timeout(5000)
                .end(function (err, res) {
                  if (err || !res.ok) {
                    console.error(err)
                    callback(null, false)
                  } else if (res.text === anchorHash) { // GET /calendar/:height/hash returns text/plain
                    callback(null, true)
                  } else {
                    callback(null, false)
                  }
                })
            } else {
              callback(null, false)
            }
          }
        })
      }
    }, (err, result) => {
      if (err) {
        console.error(err)
      } else {
        // if (!result.proofMatched || !result.proofVerified) {
        console.error(result)
        // }
      }
    })
  }
})
