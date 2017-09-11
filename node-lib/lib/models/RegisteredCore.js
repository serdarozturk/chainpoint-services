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
  COCKROACH_REG_CORE_TABLE_NAME: envalid.str({ default: 'chainpoint_registered_cores', desc: 'CockroachDB table name' }),
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

var RegisteredCore = sequelize.define(env.COCKROACH_REG_CORE_TABLE_NAME,
  {
    stackId: {
      comment: 'The Chainpoint stack identifier. Should be the domain or IP of the API. e.g. a.chainpoint.org',
      type: Sequelize.STRING,
      field: 'stack_id',
      allowNull: false,
      unique: true,
      primaryKey: true
    },
    tntAddr: {
      comment: 'A seemingly valid Ethereum address that the Core may receive Core rewards with.',
      type: Sequelize.STRING,
      validate: {
        is: ['^0x[0-9a-f]{40}$', 'i']
      },
      field: 'tnt_addr',
      allowNull: true
    },
    rewardEligible: {
      comment: 'Boolean indicating if the Core is eligible to receive Core rewards.',
      type: Sequelize.BOOLEAN,
      field: 'reward_eligible',
      allowNull: false
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
  RegisteredCore: RegisteredCore
}
