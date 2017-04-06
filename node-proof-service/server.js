const _ = require('lodash')
require('dotenv').config()

// just a temp function
let finalize = function () {
  console.log('Proofing...')
}

setInterval(() => finalize(), 1000)
