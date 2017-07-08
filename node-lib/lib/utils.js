// wait for a specified number of milliseconds to elapse
function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

module.exports = {
  sleep: sleep
}
