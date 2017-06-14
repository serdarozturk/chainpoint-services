// CockroachDB Sequelize ORM
let Sequelize = require('sequelize-cockroachdb')

const COCKROACH_HOST = process.env.COCKROACH_HOST || 'roach1'
const COCKROACH_PORT = process.env.COCKROACH_PORT || 26257
const COCKROACH_DB_NAME = process.env.COCKROACH_DB_NAME || 'chainpoint'
const COCKROACH_DB_USER = process.env.COCKROACH_DB_USER || 'chainpoint'
const COCKROACH_DB_PASS = process.env.COCKROACH_DB_PASS || ''
const COCKROACH_TABLE_NAME = process.env.COCKROACH_TABLE_NAME || 'chainpoint_calendar_blockchain'

// Connect to CockroachDB through Sequelize.
let sequelize = new Sequelize(COCKROACH_DB_NAME, COCKROACH_DB_USER, COCKROACH_DB_PASS, {
  dialect: 'postgres',
  host: COCKROACH_HOST,
  port: COCKROACH_PORT,
  logging: false
})

// Define the model and the table it will be stored in.
// See : Why don't we auto increment primary key automatically:
//   https://www.cockroachlabs.com/docs/serial.html
var CalendarBlock = sequelize.define(COCKROACH_TABLE_NAME,
  {
    id: {
      comment: 'Sequential monotonically incrementing Integer ID representing block height.',
      primaryKey: true,
      type: Sequelize.INTEGER,
      validate: {
        isInt: true
      },
      allowNull: false,
      unique: true
    },
    time: {
      comment: 'Block creation time in milliseconds since unix epoch',
      type: Sequelize.INTEGER,
      validate: {
        isInt: true
      },
      allowNull: false,
      unique: true
    },
    version: {
      comment: 'Block version number, for future use.',
      type: Sequelize.INTEGER,
      defaultValue: function () {
        return 1
      },
      validate: {
        isInt: true
      },
      allowNull: false
    },
    stackId: {
      comment: 'The Chainpoint stack identifier',
      type: Sequelize.STRING,
      field: 'stack_id',
      allowNull: false
    },
    type: {
      comment: 'Block type.',
      type: Sequelize.STRING,
      validate: {
        isIn: [['gen', 'cal', 'nist', 'btc-a', 'btc-c', 'eth-a', 'eth-c']]
      },
      allowNull: false
    },
    dataId: {
      comment: 'The identifier for the data to be anchored to this block, data identifier meaning is determined by block type.',
      type: Sequelize.STRING,
      validate: {
        is: ['^[a-fA-F0-9:]{0,255}$', 'i']
      },
      field: 'data_id',
      allowNull: false
    },
    dataVal: {
      comment: 'The data to be anchored to this block, data value meaning is determined by block type.',
      type: Sequelize.STRING,
      validate: {
        is: ['^[a-fA-F0-9:]{1,255}$', 'i']
      },
      field: 'data_val',
      allowNull: false
    },
    prevHash: {
      comment: 'Block hash of previous block',
      type: Sequelize.STRING,
      validate: {
        is: ['^[a-f0-9]{64}$', 'i']
      },
      field: 'prev_hash',
      allowNull: false,
      unique: true
    },
    hash: {
      comment: 'The block hash, a hex encoded SHA-256 over canonical values',
      type: Sequelize.STRING,
      validate: {
        is: ['^[a-f0-9]{64}$', 'i']
      },
      allowNull: false,
      unique: true
    },
    sig: {
      comment: 'Base64 encoded signature over block hash',
      type: Sequelize.STRING,
      validate: {
        is: ['^[a-zA-Z0-9=+/]{1,255}$', 'i']
      },
      allowNull: false,
      unique: true
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
  CalendarBlock: CalendarBlock
}
