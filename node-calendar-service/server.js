const _ = require('lodash')
require('dotenv').config()

// just a temp function
let finalize = function () {
  console.log('Calendaring...')
}

setInterval(() => finalize(), 1000)
