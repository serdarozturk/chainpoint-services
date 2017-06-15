const envalid = require('envalid')

module.exports = envalid.cleanEnv(process.env, {
  REDIS_CONNECT_URI: envalid.url({ default: 'redis://redis:6379', desc: 'The Redis server connection URI' }),
  RMQ_PREFETCH_COUNT: envalid.num({ default: 0, desc: 'The maximum number of messages sent over the channel that can be awaiting acknowledgement, 0 = no limit' }),
  RABBITMQ_CONNECT_URI: envalid.url({ default: 'amqp://chainpoint:chainpoint@rabbitmq', desc: 'Connection string w/ credentials for RabbitMQ' }),
  PROOF_EXPIRE_MINUTES: envalid.num({ default: 1440, desc: 'The lifespan of stored proofs, in minutes' }),
  RMQ_WORK_IN_QUEUE: envalid.str({ default: 'work.gen', desc: 'The queue name for message consumption originating from the proof state service' }),
  RMQ_OUTGOING_EXCHANGE: envalid.str({ default: 'exchange.headers', desc: 'The exchange for publishing messages bound for API Service instances' }),
  RMQ_WORK_OUT_QUEUE: envalid.str({ default: 'work.api', desc: 'The queue name for outgoing message to the api service' })
}, {
  strict: true
})
