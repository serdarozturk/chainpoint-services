const envalid = require('envalid')

module.exports = envalid.cleanEnv(process.env, {
  RMQ_PREFETCH_COUNT: envalid.num({ default: 10, desc: 'The maximum number of messages sent over the channel that can be awaiting acknowledgement, 0 = no limit' }),
  RMQ_WORK_IN_QUEUE: envalid.str({ default: 'work.state', desc: 'The queue name for message consumption originating from the splitter, aggregator, calendar, and proof state services' }),
  RMQ_WORK_OUT_STATE_QUEUE: envalid.str({ default: 'work.state', desc: 'The queue name for outgoing message to the proof state service' }),
  RMQ_WORK_OUT_GEN_QUEUE: envalid.str({ default: 'work.gen', desc: 'The queue name for outgoing message to the proof gen service' }),
  PRUNE_FREQUENCY_MINUTES: envalid.num({ default: 1, desc: 'The frequency that the proof state and hash tracker log tables have their old, unneeded data pruned, in minutes' }),
  RABBITMQ_CONNECT_URI: envalid.url({ default: 'amqp://chainpoint:chainpoint@rabbitmq', desc: 'Connection string w/ credentials for RabbitMQ' })
}, {
  strict: true
})
