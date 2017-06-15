const envalid = require('envalid')

module.exports = envalid.cleanEnv(process.env, {
  CONSUL_HOST: envalid.str({ default: 'consul', desc: 'Consul server host' }),
  CONSUL_PORT: envalid.num({ default: 8500, desc: 'Consul server port' }),
  RABBITMQ_CONNECT_URI: envalid.url({ default: 'amqp://chainpoint:chainpoint@rabbitmq', desc: 'Connection string w/ credentials for RabbitMQ' }),
  RMQ_PREFETCH_COUNT: envalid.num({ default: 0, desc: 'The maximum number of messages sent over the channel that can be awaiting acknowledgement, 0 = no limit' }),
  BTC_REC_FEE_KEY: envalid.str({ default: 'service/btc-fee/recommendation', desc: 'The consul key to watch to receive updated fee object' }),
  CHAINPOINT_STACK_ID: envalid.str({ desc: 'Unique identifier for this Chainpoint stack of services' }),
  BCOIN_API_BASE_URI: envalid.url({ desc: 'The Bcoin base URI' }),
  BCOIN_API_WALLET_ID: envalid.str({ desc: 'The wallet Id to be used' }),
  BCOIN_API_USERNAME: envalid.str({ desc: 'The API username for the Bcoin instance' }),
  RMQ_WORK_IN_QUEUE: envalid.str({ default: 'work.btctx', desc: 'The queue name for message consumption originating from the calendar service' }),
  RMQ_WORK_OUT_CAL_QUEUE: envalid.str({ default: 'work.cal', desc: 'The queue name for outgoing message to the calendar service' }),
  BTC_MAX_FEE_SAT_PER_BYTE: envalid.num({ default: 4255, desc: 'The maximum recFeeInSatPerByte value accepted' })
}, {
  strict: true
})

// BTC_MAX_FEE_SAT_PER_BYTE
// This is to safeguard against the service returning a very high value in error
// and to impose a common sense limit on the highest fee per byte to allow.
// MAX BTC to spend = AverageTxSizeBytes * BTC_MAX_FEE_SAT_PER_BYTE / 100000000
// If we are to limit the maximum fee per transaction to 0.01 BTC, then
// 0.01 = 235 * BTC_MAX_FEE_SAT_PER_BYTE / 100000000
// BTC_MAX_FEE_SAT_PER_BYTE = 0.01 *  100000000 / 235
// BTC_MAX_FEE_SAT_PER_BYTE = 4255
