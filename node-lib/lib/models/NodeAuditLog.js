/* Copyright 2017 Tierion
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*     http://www.apache.org/licenses/LICENSE-2.0
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

const Sequelize = require('sequelize-cockroachdb')

const envalid = require('envalid')

const env = envalid.cleanEnv(process.env, {
  COCKROACH_HOST: envalid.str({ devDefault: 'roach1', desc: 'CockroachDB host or IP' }),
  COCKROACH_PORT: envalid.num({ default: 26257, desc: 'CockroachDB port' }),
  COCKROACH_DB_NAME: envalid.str({ default: 'chainpoint', desc: 'CockroachDB name' }),
  COCKROACH_DB_USER: envalid.str({ default: 'chainpoint', desc: 'CockroachDB user' }),
  COCKROACH_DB_PASS: envalid.str({ default: '', desc: 'CockroachDB password' }),
  COCKROACH_AUDIT_TABLE_NAME: envalid.str({ default: 'chainpoint_node_audit_log', desc: 'CockroachDB table name' }),
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

var NodeAuditLog = sequelize.define(env.COCKROACH_AUDIT_TABLE_NAME,
  {
    tntAddr: {
      comment: 'A seemingly valid Ethereum address that the Node will send TNT from, or receive rewards with.',
      type: Sequelize.STRING,
      validate: {
        is: ['^0x[0-9a-f]{40}$']
      },
      field: 'tnt_addr',
      allowNull: false
    },
    publicUri: {
      comment: 'The public URI of the Node at the time of the audit.',
      type: Sequelize.STRING,
      validate: {
        isUrl: true
      },
      field: 'public_uri',
      allowNull: true
    },
    auditAt: {
      comment: 'The time the audit was performed, in MS since EPOCH.',
      type: Sequelize.INTEGER, // is 64 bit in CockroachDB
      validate: {
        isInt: true
      },
      field: 'audit_at',
      allowNull: false
    },
    publicIPPass: {
      comment: 'Boolean logging if the Node was publicly reachable over HTTP by Core.',
      type: Sequelize.BOOLEAN,
      field: 'public_ip_pass',
      allowNull: false
    },
    nodeMSDelta: {
      comment: 'The number of milliseconds difference between Node time and Core time.',
      type: Sequelize.INTEGER, // is 64 bit in CockroachDB
      validate: {
        isInt: true
      },
      field: 'node_ms_delta',
      allowNull: true
    },
    timePass: {
      comment: 'Boolean logging if the Node reported time was verified to be in tolerance by Core.',
      type: Sequelize.BOOLEAN,
      field: 'time_pass',
      allowNull: false
    },
    calStatePass: {
      comment: 'Boolean logging if the Node Calendar was verified by Core.',
      type: Sequelize.BOOLEAN,
      field: 'cal_state_pass',
      allowNull: false
    }
  },
  {
    // No automatic timestamp fields, we add our own 'audit_at'
    timestamps: false,
    // Disable the modification of table names; By default, sequelize will automatically
    // transform all passed model names (first parameter of define) into plural.
    // if you don't want that, set the following
    freezeTableName: true,
    indexes: [
      // Create a unique index on audit_at
      {
        unique: false,
        fields: ['audit_at']
      }
    ]
  }
)

module.exports = {
  sequelize: sequelize,
  NodeAuditLog: NodeAuditLog
}
