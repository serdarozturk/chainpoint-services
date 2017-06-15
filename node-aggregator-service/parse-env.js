const envalid = require('envalid')

const aggInterval = envalid.makeValidator(x => {
  if (x >= 250 && x <= 10000) return x
  else throw new Error('Value must be between 250 and 10000, inclusive')
})
const finInterval = envalid.makeValidator(x => {
  if (x >= 250 && x <= 10000) return x
  else throw new Error('Value must be between 250 and 10000, inclusive')
})
const maxHashes = envalid.makeValidator(x => {
  if (x >= 100 && x <= 25000) return x
  else throw new Error('Value must be between 100 and 25000, inclusive')
})

module.exports = envalid.cleanEnv(process.env, {
  CONSUL_HOST: envalid.str({ default: 'consul', desc: 'Consul server host' }),
  CONSUL_PORT: envalid.num({ default: 8500, desc: 'Consul server port' }),
  AGGREGATION_INTERVAL: aggInterval({ default: 1000, desc: 'The frequency of the aggregation process, in milliseconds' }),
  FINALIZATION_INTERVAL: finInterval({ default: 250, desc: 'The frequency of the finalization of trees and delivery to state service, in milliseconds' }),
  HASHES_PER_MERKLE_TREE: maxHashes({ default: 25000, desc: 'The maximum number of hashes to be used when constructing an aggregation tree' }),
  RMQ_PREFETCH_COUNT: envalid.num({ default: 0, desc: 'The maximum number of messages sent over the channel that can be awaiting acknowledgement, 0 = no limit' }),
  RMQ_WORK_IN_QUEUE: envalid.str({ default: 'work.agg', desc: 'The queue name for message consumption originating from the splitter service' }),
  RMQ_WORK_OUT_CAL_QUEUE: envalid.str({ default: 'work.cal', desc: 'The queue name for outgoing message to the calendar service' }),
  RMQ_WORK_OUT_STATE_QUEUE: envalid.str({ default: 'work.state', desc: 'The queue name for outgoing message to the proof state service' }),
  RABBITMQ_CONNECT_URI: envalid.url({ default: 'amqp://chainpoint:chainpoint@rabbitmq', desc: 'Connection string w/ credentials for RabbitMQ' }),
  NIST_KEY: envalid.str({ default: 'service/nist/latest', desc: 'The consul key to watch to receive updated NIST object' })
}, {
  strict: true
})
