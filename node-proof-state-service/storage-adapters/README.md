# chainpoint-node-proof-state-service

## Storage Adapters

Storage adapters allow the service to write to persistent storage. All adapters conform to a common interface, allowing easy code-based or programmatic switching between different storage providers.

The following is a description of methods that must be defined in a storage adapter: 

| Name           | Description  | Returns  |
| :------------- |:-------------|:-------------|
| openConnection(callback(err, success))       | opens the connection to the underlying storage provider | boolean indicating success |
| getHashIdsByAggId(aggId, callback(err, hashIds))     | gets all hash ids associated with an aggregation event | result array containing hash id objects |
| getAggStateObjectByHashId(hashId, callback(err, stateObject))     | gets the agg state object for a given hash id | result array containing one agg state object |
| getCalStateObjectByAggId(aggId, callback(err, stateObject))     | gets the cal state object for a given agg id | result array containing one cal state object |
| getBTCTxStateObjectByCalId(calId, callback(err, stateObject))     | gets the btctx state object for a given cal id | result array containing one btctx state object |
| getBTCHeadStateObjectByBTCTxId(btcTxId, callback(err, stateObject))     | gets the btchead state object for a given btctx id | result array containing one btchead state object |
| getAggStateObjectsByAggId(aggId, callback(err, stateObjects))     | gets all agg state data for a given agg id | result array containing agg state objects |
| getCalStateObjectsByCalId(calId, callback(err, stateObjects))     | gets all cal state data for a given cal id | result array containing cal state objects |
| getBTCTxStateObjectsByBTCTxId(btcTxId, callback(err, stateObjects))     | gets all btctx state data for a given btctx id | result array containing btctx state objects |
| getBTCHeadStateObjectsByBTCHeadId(btcHeadId, callback(err, stateObjects))     | gets all btchead state data for a given btchead id | result array containing btchead state objects |
| writeAggStateObject(stateObject, callback(err, success))     | write the agg state object to storage | boolean indicating success |
| writeCalStateObject(stateObject, callback(err, success))     | write the cal state object to storage | boolean indicating success |
| writeBTCTxStateObject(stateObject, callback(err, success))     | write the btctx state object to storage | boolean indicating success |
| writeBTCHeadStateObject(stateObject, callback(err, success))     | write the btchead state object to storage | boolean indicating success |
| logSplitterEventForHashId(hashId, hash, callback(err, success))     | log a splitter event for the given hash id to the hash tracker | boolean indicating success |
| logAggregationEventForHashId(hashId, callback(err, success))     | log an aggregation event for the given hash id to the hash tracker | boolean indicating success |
| logCalendarEventForHashId(hashId, callback(err, success))     | log a calendar event for the given hash id to the hash tracker | boolean indicating success |
| logEthEventForHashId(hashId, callback(err, success))     | log an eth event for the given hash id to the hash tracker | boolean indicating success |
| logBtcEventForHashId(hashId, callback(err, success))     | log a btc event for the given hash id to the hash tracker | boolean indicating success |

## Crate DB Adapter Configuration
Configuration parameters will be stored in environment variables. Environment variables can be overridden throught the use of a .env file. 

The following are the descriptions of the configuration parameters:

| Name           | Description  | Default |
| :------------- |:-------------|:--------|
| CRATE\_CONNECT\_PROTOCOL      | the CrateDB connection protocol | 'http:' |
| CRATE\_CONNECT\_HOST       | the CrateDB connection hostname | 'crate' |
| CRATE\_CONNECT\_PORT       | the CrateDB connection port | 4200 |

