const envalid = require('envalid')

module.exports = envalid.cleanEnv(process.env, {
  ANCHOR_BTC: envalid.bool({ desc: 'Boolean flag for enabling and disabling BTC anchoring' }),
  ANCHOR_ETH: envalid.bool({ desc: 'Boolean flag for enabling and disabling ETH anchoring' }),
  CHAINPOINT_STACK_ID: envalid.str({ desc: 'Unique identifier for this Chainpoint stack of services' }),
  CHAINPOINT_BASE_URI: envalid.url({ desc: 'Base URI for this Chainpoint stack of services' }),
  CONSUL_HOST: envalid.str({ default: 'consul', desc: 'Consul server host' }),
  CONSUL_PORT: envalid.num({ default: 8500, desc: 'Consul server port' }),
  CALENDAR_LOCK_KEY: envalid.str({ default: 'service/calendar/blockchain/lock', desc: 'Key used for acquiring calendar write locks' }),
  CALENDAR_INTERVAL_MS: envalid.num({ default: 10000, desc: 'The frequency to generate new calendar blocks, defaults to 10 seconds' }),
  ANCHOR_BTC_INTERVAL_MS: envalid.num({ default: 1800000, desc: 'The frequency to generate new btc-a blocks and btc anchoring, defaults to 30 minutes' }),
  ANCHOR_ETH_INTERVAL_MS: envalid.num({ default: 600000, desc: 'The frequency to generate new eth-a blocks and eth anchoring, defaults to 10 minutes' }),
  RMQ_PREFETCH_COUNT: envalid.num({ default: 0, desc: 'The maximum number of messages sent over the channel that can be awaiting acknowledgement, 0 = no limit' }),
  RMQ_WORK_IN_QUEUE: envalid.str({ default: 'work.cal', desc: 'The queue name for message consumption originating from the aggregator, btc-tx, and btc-mon services' }),
  RMQ_WORK_OUT_STATE_QUEUE: envalid.str({ default: 'work.state', desc: 'The queue name for outgoing message to the proof state service' }),
  RMQ_WORK_OUT_BTCTX_QUEUE: envalid.str({ default: 'work.btctx', desc: 'The queue name for outgoing message to the btc tx service' }),
  RMQ_WORK_OUT_BTCMON_QUEUE: envalid.str({ default: 'work.btcmon', desc: 'The queue name for outgoing message to the btc mon service' }),
  RABBITMQ_CONNECT_URI: envalid.str({ default: 'amqp://chainpoint:chainpoint@rabbitmq', desc: 'Connection string w/ credentials for RabbitMQ' }),
  NIST_KEY: envalid.str({ default: 'service/nist/latest', desc: 'The consul key to watch to receive updated NIST object' }),
  NACL_KEYPAIR_SEED: envalid.str({ desc: 'The seed used for NaCl keypair generation' })
}, {
  strict: true
})
