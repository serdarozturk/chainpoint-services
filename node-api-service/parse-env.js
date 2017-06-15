const envalid = require('envalid')

module.exports = envalid.cleanEnv(process.env, {
  REDIS_CONNECT_URI: envalid.url({ default: 'redis://redis:6379', desc: 'The Redis server connection URI' }),
  RMQ_INCOMING_EXCHANGE: envalid.str({ default: 'exchange.headers', desc: 'The exchange for receiving messages from proof gen service' }),
  RMQ_WORK_IN_QUEUE: envalid.str({ default: 'work.api', desc: 'The queue name for message consumption originating from proof gen service' }),
  RMQ_WORK_OUT_QUEUE: envalid.str({ default: 'work.splitter', desc: 'The queue name for outgoing message to the splitter service' }),
  PROOF_EXPIRE_MINUTES: envalid.num({ default: 1440, desc: 'The lifespan of stored proofs, in minutes' }),
  GET_PROOFS_MAX_REST: envalid.num({ default: 250, desc: 'The maximum number of proofs that can be requested in one GET /proofs request' }),
  GET_PROOFS_MAX_WS: envalid.num({ default: 250, desc: 'The maximum number of proofs that can be requested/subscribed to in one call' }),
  RMQ_PREFETCH_COUNT: envalid.num({ default: 0, desc: 'The maximum number of messages sent over the channel that can be awaiting acknowledgement, 0 = no limit' }),
  RABBITMQ_CONNECT_URI: envalid.url({ default: 'amqp://chainpoint:chainpoint@rabbitmq', desc: 'Connection string w/ credentials for RabbitMQ' }),
  MAX_BODY_SIZE: envalid.num({ default: 131072, desc: 'Mox body size in bytes for incoming requests' }),
  POST_HASHES_MAX: envalid.num({ default: 1000, desc: 'The maximum number of hashes allowed to be submitted in one request' }),
  POST_VERIFY_PROOFS_MAX: envalid.num({ default: 1000, desc: 'The maximum number of proofs allowed to be verified in one request' }),
  GET_CALENDAR_BLOCKS_MAX: envalid.num({ default: 1000, desc: 'The maximum number of calendar blocks allowed to be retrieved in one request' }),
  NODE_ENV: envalid.str({ default: 'production', desc: 'The type of environment in which the service is running' })
}, {
  strict: true
})
