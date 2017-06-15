const envalid = require('envalid')

module.exports = envalid.cleanEnv(process.env, {
  CONSUL_HOST: envalid.str({ default: 'consul', desc: 'Consul server host' }),
  CONSUL_PORT: envalid.num({ default: 8500, desc: 'Consul server port' }),
  NIST_INTERVAL_MS: envalid.num({ default: 60000, desc: 'The frequency to get latest NIST beacon data, in milliseconds' }),
  NIST_KEY: envalid.str({ default: 'service/nist/latest', desc: 'The consul key to watch to receive updated NIST object' })
}, {
  strict: true
})
