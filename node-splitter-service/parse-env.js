const envalid = require('envalid')

module.exports = envalid.cleanEnv(process.env, {
  RMQ_PREFETCH_COUNT: envalid.num({ default: 0, desc: 'The maximum number of messages sent over the channel that can be awaiting acknowledgement, 0 = no limit' }),
  RMQ_WORK_IN_QUEUE: envalid.str({ default: 'work.splitter', desc: 'The queue name for message consumption originating from the api service' }),
  RMQ_WORK_OUT_AGG_QUEUE: envalid.str({ default: 'work.agg', desc: 'The queue name for outgoing message to the aggregator service' }),
  RMQ_WORK_OUT_STATE_QUEUE: envalid.str({ default: 'work.state', desc: 'The queue name for outgoing message to the proof state service' }),
  RABBITMQ_CONNECT_URI: envalid.url({ default: 'amqp://chainpoint:chainpoint@rabbitmq', desc: 'Connection string w/ credentials for RabbitMQ' })
}, {
  strict: true
})
