const _ = require('lodash')
require('dotenv').config()

// just a temp function
let split = function () {
  console.log('Splitting...')
}

setInterval(() => split(), 1000)
