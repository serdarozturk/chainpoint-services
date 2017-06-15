const envalid = require('envalid')

module.exports = envalid.cleanEnv(process.env, {
  CONSUL_HOST: envalid.str({ default: 'consul', desc: 'Consul server host' }),
  CONSUL_PORT: envalid.num({ default: 8500, desc: 'Consul server port' }),
  REDIS_CONNECT_URI: envalid.url({ default: 'redis://redis:6379', desc: 'The Redis server connection URI' }),
  INFLUXDB_HOST: envalid.str({ default: 'influxdb', desc: 'The Influx server host' }),
  INFLUXDB_PORT: envalid.num({ default: 8086, desc: 'The Influx server port' }),
  INFLUXDB_DB: envalid.str({ default: 'chainpoint_fees', desc: 'The Influx server database name' }),
  REC_FEES_URI: envalid.str({ default: 'https://bitcoinfees.21.co/api/v1/fees/recommended', desc: 'The endpoint from which to retrieve recommended fee data' }),
  BTC_REC_FEE_KEY: envalid.str({ default: 'service/btc-fee/recommendation', desc: 'The published key location where recommended fee will be stored for use by other services' })
}, {
  strict: true
})
