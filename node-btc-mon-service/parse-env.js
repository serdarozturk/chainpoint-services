const envalid = require('envalid')

const monitorRange = envalid.makeValidator(x => {
  if (x >= 10 && x <= 600) return x
  else throw new Error('Value must be between 10 and 600, inclusive')
})
const minConfirmRange = envalid.makeValidator(x => {
  if (x >= 1 && x <= 16) return x
  else throw new Error('Value must be between 1 and 16, inclusive')
})

module.exports = envalid.cleanEnv(process.env, {
  RMQ_PREFETCH_COUNT: envalid.num({ default: 0, desc: 'The maximum number of messages sent over the channel that can be awaiting acknowledgement, 0 = no limit' }),
  MONITOR_INTERVAL_SECONDS: monitorRange({ default: 30, desc: 'The frequency that transactions are monitored for new confirmations, in seconds' }),
  MIN_BTC_CONFIRMS: minConfirmRange({ default: 6, desc: 'The number of confirmations needed before the transaction is considered ready for proof delivery' }),
  RMQ_WORK_IN_QUEUE: envalid.str({ default: 'work.btcmon', desc: 'The queue name for message consumption originating from the calendar service' }),
  RMQ_WORK_OUT_CAL_QUEUE: envalid.str({ default: 'work.cal', desc: 'The queue name for outgoing message to the calendar service' }),
  BCOIN_API_BASE_URI: envalid.url({ desc: 'The Bcoin base URI' }),
  BCOIN_API_USERNAME: envalid.str({ desc: 'The API username for the Bcoin instance' }),
  BCOIN_API_PASS: envalid.str({ desc: 'The API password for the Bcoin instance' }),
  RABBITMQ_CONNECT_URI: envalid.url({ default: 'amqp://chainpoint:chainpoint@rabbitmq', desc: 'Connection string w/ credentials for RabbitMQ' })
}, {
  strict: true
})
