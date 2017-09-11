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
  COCKROACH_REG_NODE_TABLE_NAME: envalid.str({ default: 'chainpoint_registered_nodes', desc: 'CockroachDB table name' }),
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

var RegisteredNode = sequelize.define(env.COCKROACH_REG_NODE_TABLE_NAME,
  {
    tntAddr: {
      comment: 'A seemingly valid Ethereum address that the Node will send TNT from, or receive rewards with.',
      type: Sequelize.STRING,
      validate: {
        is: ['^0x[0-9a-f]{40}$', 'i']
      },
      field: 'tnt_addr',
      allowNull: false,
      unique: true,
      primaryKey: true
    },
    publicUri: {
      comment: 'The public URI address of a Node, when blank represents a non-public Node.',
      type: Sequelize.STRING,
      validate: {
        isUrl: true
      },
      field: 'public_uri',
      allowNull: true
    },
    hmacKey: {
      comment: 'The HMAC secret for this Node. Needed for Node data updates.',
      type: Sequelize.STRING,
      validate: {
        is: ['^[a-f0-9]{64}$', 'i']
      },
      field: 'hmac_key',
      allowNull: false,
      unique: true
    },
    lastAuditAt: {
      comment: 'The last time an audit was performed for this Node, in MS since EPOCH.',
      type: Sequelize.INTEGER, // is 64 bit in CockroachDB
      validate: {
        isInt: true
      },
      field: 'last_audit_at',
      allowNull: true
    },
    tntCredit: {
      comment: 'The balance of token credit they have against their address.',
      type: Sequelize.DOUBLE,
      field: 'tnt_credit',
      defaultValue: 0
    }
  },
  {
    // Disable the modification of table names; By default, sequelize will automatically
    // transform all passed model names (first parameter of define) into plural.
    // if you don't want that, set the following
    freezeTableName: true,
    // enable timestamps
    timestamps: true,
    // don't use camelcase for automatically added attributes but underscore style
    // so updatedAt will be updated_at
    underscored: true
  }
)

module.exports = {
  sequelize: sequelize,
  RegisteredNode: RegisteredNode
}
