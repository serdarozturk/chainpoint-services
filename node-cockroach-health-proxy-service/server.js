const request = require('superagent')
const restify = require('restify')

// Don't fail the upstream request due to an self-signed cert.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

if (!process.env.COCKROACH_HEALTH_CHECK_URI) {
  console.error('Missing COCKROACH_HEALTH_CHECK_URI environment variable')
  process.exit(1)
}

const healthCheckUrl = process.env.COCKROACH_HEALTH_CHECK_URI

let lastResponseOk = false
let lastResponseBody = {}

const doHealthCheck = () => {
  request
   .get(healthCheckUrl)
   .end(function (err, res) {
     if (err) {
       console.error('Upstream health check failed.')
       lastResponseOk = false
       lastResponseBody = {}
       return
     }

     // console.log('Upstream health check passed.')
     lastResponseOk = true
     lastResponseBody = res.body
   })
}

// Perform the upstream health check at startup and every second
doHealthCheck()
setInterval(() => doHealthCheck(), 1000)

// Restify API Server
function respond (req, res, next) {
  if (lastResponseOk) {
    res.json(lastResponseBody)
  } else {
    return next(new restify.BadGatewayError('CockroachDB Health Check Failed'))
  }
}

const server = restify.createServer()
server.get('/', respond)
server.get('/health', respond)

server.listen(8080, function () {
  console.log('%s listening at %s', server.name, server.url)
})
