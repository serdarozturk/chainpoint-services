/**
 * Sleep for a specified number of milliseconds
 *
 * @param {number} ms - The number of milliseconds to sleep
 */
function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Add specified seconds to a Date object
 *
 * @param {Date} date - The starting date
 * @param {number} seconds - The seconds of seconds to add to the date
 * @returns {Date}
 */
function addSeconds (date, seconds) {
  return new Date(date.getTime() + (seconds * 1000))
}

/**
 * Add specified minutes to a Date object
 *
 * @param {Date} date - The starting date
 * @param {number} minutes - The number of minutes to add to the date
 * @returns {Date}
 */
function addMinutes (date, minutes) {
  return new Date(date.getTime() + (minutes * 60000))
}

/**
 * Convert Date to ISO8601 string, stripping milliseconds
 * '2017-03-19T23:24:32Z'
 *
 * @param {Date} date - The date to convert
 * @returns {string} An ISO8601 formatted time string
 */
function formatDateISO8601NoMs (date) {
  return date.toISOString().slice(0, 19) + 'Z'
}

/**
 * Checks if value is a hexadecimal string
 *
 * @param {string} value - The value to check
 * @returns {bool} true if value is a hexadecimal string, otherwise false
 */
function isHex (value) {
  var hexRegex = /^[0-9a-f]{2,}$/i
  var isHex = hexRegex.test(value) && !(value.length % 2)
  return isHex
}

module.exports = {
  sleep: sleep,
  addMinutes: addMinutes,
  addSeconds: addSeconds,
  formatDateISO8601NoMs: formatDateISO8601NoMs,
  isHex: isHex
}
