# chainpoint-node-proof-state-service

## Storage Adapters

Storage adapters allow the service to write to persistent storage. All adapters conform to a common interface, allowing easy code-based or programmatic switching between different storage providers.

The following is a description of methods that must be defined in a storage adapter: 

| Name           | Description  | Returns  |
| :------------- |:-------------|:-------------|
| openConnection(callback(err, success))       | opens the connection to the underlying storage provider | boolean indicating success |
| getHashIdCountByAggId(aggId, callback(err, count))     | gets all count of hash objects for a given agg_id currently in the database | integer |
| getHashIdsByAggId(aggId, callback(err, hashIds))     | gets all hash ids associated with an aggregation event | result array containing hash id objects |
| getHashIdsByBtcTxId(btcTxId, callback(err, hashIds))     | gets all hash ids associated with a btcTxId | result array containing hash id objects |
| getAggStateObjectByHashId(hashId, callback(err, stateObject))     | gets the agg state object for a given hash id | an agg state object |
| getCalStateObjectByAggId(aggId, callback(err, stateObject))     | gets the cal state object for a given agg id | a cal state object |
| getAnchorAggStateObjectByCalId(calId, callback(err, stateObject))     | gets the anchor agg state object for a given cal id | an anchor agg state object |
| getBTCTxStateObjectByAnchorAggId(anchorAggId, callback(err, stateObject))     | gets the btctx state object for a given anchor agg id | a btctx state object |
| getBTCHeadStateObjectByBTCTxId(btcTxId, callback(err, stateObject))     | gets the btchead state object for a given btctx id | a btchead state object |
| getAggStateObjectsByAggId(aggId, callback(err, stateObjects))     | gets all agg state data for a given agg id | result array containing agg state objects |
| getCalStateObjectsByCalId(calId, callback(err, stateObjects))     | gets all cal state data for a given cal id | result array containing cal state objects |
| getAnchorAggStateObjectsByAnchorAggId(anchorAggId, callback(err, stateObjects))     | gets all anchor agg state data for a given anchor agg id | result array containing anchor agg state objects |
| getBTCTxStateObjectsByBTCTxId(btcTxId, callback(err, stateObjects))     | gets all btctx state data for a given btctx id | result array containing btctx state objects |
| getBTCHeadStateObjectsByBTCHeadId(btcHeadId, callback(err, stateObjects))     | gets all btchead state data for a given btchead id | result array containing btchead state objects |
| writeAggStateObject(stateObject, callback(err, success))     | write the agg state object to storage | boolean indicating success |
| writeCalStateObject(stateObject, callback(err, success))     | write the cal state object to storage | boolean indicating success |
| writeAnchorAggStateObject(stateObject, callback(err, success))     | write the anchor agg state object to storage | boolean indicating success |
| writeBTCTxStateObject(stateObject, callback(err, success))     | write the btctx state object to storage | boolean indicating success |
| writeBTCHeadStateObject(stateObject, callback(err, success))     | write the btchead state object to storage | boolean indicating success |
| logSplitterEventForHashId(hashId, hash, callback(err, success))     | log a splitter event for the given hash id to the hash tracker | boolean indicating success |
| logAggregationEventForHashId(hashId, callback(err, success))     | log an aggregation event for the given hash id to the hash tracker | boolean indicating success |
| logCalendarEventForHashId(hashId, callback(err, success))     | log a calendar event for the given hash id to the hash tracker | boolean indicating success |
| logEthEventForHashId(hashId, callback(err, success))     | log an eth event for the given hash id to the hash tracker | boolean indicating success |
| logBtcEventForHashId(hashId, callback(err, success))     | log a btc event for the given hash id to the hash tracker | boolean indicating success |
| deleteProcessedHashesFromAggStates(callback(err, rowCount))     | prune records from agg\_states table | integer |
| deleteHashTrackerLogEntries(callback(err, rowCount))     | prune records from hash\_tracker\_logs table | integer |
| deleteCalStatesWithNoRemainingAggStates(callback(err, rowCount))     | prune records from cal\_states table | integer |
| deleteAnchorAggStatesWithNoRemainingCalStates(callback(err, rowCount))     | prune records from anchor\_agg\_states table | integer |
| deleteBtcTxStatesWithNoRemainingAnchorAggStates(callback(err, rowCount))     | prune records from btctx\_states table | integer |
| deleteBtcHeadStatesWithNoRemainingBtcTxStates(callback(err, rowCount))     | prune records from btchead\_states table | integer |


## PostregSQL Adapter Configuration
Configuration parameters will be stored in environment variables. Environment variables can be overridden throught the use of a .env file. 

The following are the descriptions of the configuration parameters:

| Name           | Description  | Default |
| :------------- |:-------------|:--------|
| POSTGRES\_CONNECT\_PROTOCOL      | the PostgreSQL connection protocol | 'postgres:' |
| POSTGRES\_CONNECT\_USER       | the PostgreSQL connection username | 'chainpoint' |
| POSTGRES\_CONNECT\_PW       | the PostgreSQL connection password | 'chainpoint' |
| POSTGRES\_CONNECT\_HOST      | the PostgreSQL connection hostname | 'postgres' |
| POSTGRES\_CONNECT\_PORT       | the PostgreSQL connection port | 5432 |
| POSTGRES\_CONNECT\_DB       | the PostgreSQL connection database name | 'chainpoint' |

## PostregSQL Adapter Schema

### agg\_states
| Column         | Type         | Description  | Indexed |
| :------------- |:-------------|:-------------|:--------|
| hash\_id        | UUID         | the submitted hash's unique identifier | primary key |
| hash            | String       | the submitted hash value  |   |
| agg\_id         | UUID         | the aggregation event unique identifier | y |
| agg\_state      | Text         | the chainpoint operations connecting the hash to the aggregation event's root value |   |

### cal\_states
| Column          | Type         | Description  | Indexed |
| :-------------  |:-------------|:-------------|:--------|
| agg\_id         | UUID         | the aggregation event unique identifier | primary key |
| cal\_id         | UUID         | the calendar aggregation event unique identifier | y |
| cal\_state      | Text         | the chainpoint operations connecting the aggregation event's root value to a calendar anchor |   |

### anchor\_agg\_states
| Column          | Type         | Description  | Indexed |
| :-------------  |:-------------|:-------------|:--------|
| cal\_id         | UUID         | the calendar aggregation event unique identifier | primary key |
| anchor\_agg\_id         | UUID         | the anchor aggregation event unique identifier | y |
| anchor\_agg\_state      | Text         | the chainpoint operations connecting the calendar block hash value to the anchor aggregation event's root value |   |

### btctx\_states
| Column          | Type         | Description  | Indexed |
| :-------------  |:-------------|:-------------|:--------|
| anchor\_agg\_id | UUID         | the anchor aggregation event unique identifier | primary key |
| btctx\_id         | STRING         | the bitcoin transaction id value | y |
| btctx\_state      | Text         | the chainpoint operations connecting the anchor aggregation root value to the bitcoin transaction body value |   |

### btchead\_states
| Column          | Type         | Description  | Indexed |
| :-------------  |:-------------|:-------------|:--------|
| btctx\_id | String         | the bitcoin transaction id value | primary key |
| btchead\_height         | Integer         | the bitcoin block height for the block cointaining the transaction | y |
| btchead\_state      | Text         | the chainpoint operations connecting the bitcoin transaction body value to a btc anchor |   |

### btchead\_states
| Column          | Type         | Description  | Indexed |
| :-------------  |:-------------|:-------------|:--------|
| btctx\_id | String         | the bitcoin transaction id value | primary key |
| btchead\_height         | Integer         | the bitcoin block height for the block cointaining the transaction | y |
| btchead\_state      | Text         | the chainpoint operations connecting the bitcoin transaction body value to a btc anchor |   |

### hash\_tracker\_log
| Column          | Type         | Description  | Indexed |
| :-------------  |:-------------|:-------------|:--------|
| hash\_id | UUID           | the submitted hash's unique identifier | primary key |
| hash     | String         | the submitted hash value | y |
| splitter_at     | Date         | the timestamp when the hash was processed by the splitter service |  |
| aggregator_at     | Date         | the timestamp when the hash was processed by the aggregator service |  |
| calendar_at     | Date         | the timestamp when the calendar proof was ready for this hash |  |
| btc_at     | Date         | the timestamp when the btc proof was ready for this hash |  |
| eth_at     | Date         | the timestamp when the eth proof was ready for this hash |  |
| steps_complete     | Integer         | the number of completed events for this hash | y |
