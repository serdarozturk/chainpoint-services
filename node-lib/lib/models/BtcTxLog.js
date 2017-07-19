const Sequelize = require('sequelize-cockroachdb')

const envalid = require('envalid')

const env = envalid.cleanEnv(process.env, {
  COCKROACH_HOST: envalid.str({ devDefault: 'roach1', desc: 'CockroachDB host or IP' }),
  COCKROACH_PORT: envalid.num({ default: 26257, desc: 'CockroachDB port' }),
  COCKROACH_DB_NAME: envalid.str({ default: 'chainpoint', desc: 'CockroachDB name' }),
  COCKROACH_DB_USER: envalid.str({ default: 'chainpoint', desc: 'CockroachDB user' }),
  COCKROACH_DB_PASS: envalid.str({ default: '', desc: 'CockroachDB password' }),
  COCKROACH_BTC_TX_LOG_TABLE_NAME: envalid.str({ default: 'chainpoint_btc_tx_log', desc: 'CockroachDB table name' }),
  COCKROACH_TLS_CA_CRT: envalid.str({ devDefault: '', desc: 'CockroachDB TLS CA Cert' }),
  COCKROACH_TLS_CLIENT_KEY: envalid.str({ devDefault: '', desc: 'CockroachDB TLS Client Key' }),
  COCKROACH_TLS_CLIENT_CRT: envalid.str({ devDefault: '', desc: 'CockroachDB TLS Client Cert' })
})

// Connect to CockroachDB through Sequelize.
let sequelizeOptions = {
  dialect: 'postgres',
  host: env.COCKROACH_HOST,
  port: env.COCKROACH_PORT,
  logging: false
}

// Present TLS client certificate to production cluster
if (env.isProduction) {
  sequelizeOptions.dialectOptions = {
    ssl: {
      rejectUnauthorized: false,
      ca: env.COCKROACH_TLS_CA_CRT,
      key: env.COCKROACH_TLS_CLIENT_KEY,
      cert: env.COCKROACH_TLS_CLIENT_CRT
    }
  }
}

let sequelize = new Sequelize(env.COCKROACH_DB_NAME, env.COCKROACH_DB_USER, env.COCKROACH_DB_PASS, sequelizeOptions)

// Define the model and the table it will be stored in.
var BtcTxLog = sequelize.define(env.COCKROACH_BTC_TX_LOG_TABLE_NAME,
  {
    txId: {
      comment: 'The bitcoin transaction id hash.',
      primaryKey: true,
      type: Sequelize.STRING,
      validate: {
        is: ['^[a-fA-F0-9:]{1,255}$', 'i']
      },
      field: 'tx_id',
      allowNull: false,
      unique: true
    },
    publishDate: {
      comment: 'Transaction publish time in milliseconds since unix epoch',
      type: Sequelize.INTEGER,
      validate: {
        isInt: true
      },
      field: 'publish_date',
      allowNull: false,
      unique: true
    },
    txSizeBytes: {
      comment: 'Size of the transaction in bytes',
      type: Sequelize.INTEGER,
      validate: {
        isInt: true
      },
      field: 'tx_size_bytes',
      allowNull: false
    },
    feeBtcPerKb: {
      comment: 'The fee expressed in BTC per kilobyte',
      type: Sequelize.FLOAT,
      validate: {
        isFloat: true
      },
      field: 'fee_btc_per_kb',
      allowNull: false
    },
    feePaidBtc: {
      comment: 'The fee paid for this transaction expressed in BTC',
      type: Sequelize.FLOAT,
      validate: {
        isFloat: true
      },
      field: 'fee_paid_btc',
      allowNull: false
    },
    inputAddress: {
      comment: 'The bitcoin input address',
      type: Sequelize.STRING,
      validate: {
        is: ['^[123mn][1-9A-HJ-NP-Za-km-z]{26,35}$', 'i']
      },
      field: 'input_address',
      allowNull: false
    },
    outputAddress: {
      comment: 'The bitcoin output address',
      type: Sequelize.STRING,
      validate: {
        is: ['^[123mn][1-9A-HJ-NP-Za-km-z]{26,35}$', 'i']
      },
      field: 'output_address',
      allowNull: false
    },
    balanceBtc: {
      comment: 'The remaining balance for the stack\'s bitcoin wallet expressed in BTC',
      type: Sequelize.FLOAT,
      validate: {
        isFloat: true
      },
      field: 'balance_btc',
      allowNull: false
    },
    stackId: {
      comment: 'The unique identifier for the stack in which this service runs',
      type: Sequelize.STRING,
      field: 'stack_id',
      allowNull: false
    }
  },
  {
    // No automatic timestamp fields, we add our own 'timestamp' so it is
    // known prior to save so it can be included in the block signature.
    timestamps: false,
    // Disable the modification of table names; By default, sequelize will automatically
    // transform all passed model names (first parameter of define) into plural.
    // if you don't want that, set the following
    freezeTableName: true
  }
)

module.exports = {
  sequelize: sequelize,
  BtcTxLog: BtcTxLog
}
