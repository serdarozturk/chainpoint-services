// CockroachDB Sequelize ORM
let Sequelize = require('sequelize-cockroachdb')

const COCKROACH_HOST = process.env.COCKROACH_HOST || 'roach1'
const COCKROACH_PORT = process.env.COCKROACH_PORT || 26257
const COCKROACH_DB_NAME = process.env.COCKROACH_DB_NAME || 'chainpoint'
const COCKROACH_DB_USER = process.env.COCKROACH_DB_USER || 'chainpoint'
const COCKROACH_DB_PASS = process.env.COCKROACH_DB_PASS || ''
const COCKROACH_TABLE_NAME = process.env.COCKROACH_TABLE_NAME || 'chainpoint_btc_tx_log'

// Connect to CockroachDB through Sequelize.
let sequelize = new Sequelize(COCKROACH_DB_NAME, COCKROACH_DB_USER, COCKROACH_DB_PASS, {
  dialect: 'postgres',
  host: COCKROACH_HOST,
  port: COCKROACH_PORT,
  logging: false
})

// Define the model and the table it will be stored in.
var BtcTxLog = sequelize.define(COCKROACH_TABLE_NAME,
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
