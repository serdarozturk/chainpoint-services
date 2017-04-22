# chainpoint-node-proof-state-service

## Storage Adapters

Storage adapters allow the service to write to persistent storage. All adapters conform to a common interface, allowing easy code-based or programmatic switching between different storage providers.

The following is a description of methods that must be defined in a storage adapter: 

| Name           | Description  | Returns  |
| :------------- |:-------------|:-------------|
| openConnection(callback(err, success))       | opens the connection to the underlying storage provider | boolean indicating success |
| getHashIdsByAggId(aggId, callback(err, hashIds))     | gets all hash ids associated with an aggregation event | hash id string array |
| getAggStateObjectByHashId(hashId, callback(err, stateObject))     | gets the agg state object for a given hash id | agg state object |
| getCalStateObjectByAggId(aggId, callback(err, stateObject))     | gets the cal state object for a given agg id | cal state object |
| getBTCTxStateObjectByCalId(calId, callback(err, stateObject))     | gets the btctx state object for a given cal id | btctx state object |
| getBTCHeadStateObjectByBTCTxId(btcTxId, callback(err, stateObject))     | gets the btchead state object for a given btctx id | btchead state object |
| getAggStateObjectsByAggId(aggId, callback(err, stateObjects))     | gets all agg state data for a given agg id | array of agg state objects |
| getCalStateObjectsByCalId(calId, callback(err, stateObjects))     | gets all cal state data for a given cal id | array of cal state objects |
| getBTCTxStateObjectsByBTCTxId(btcTxId, callback(err, stateObjects))     | gets all btctx state data for a given btctx id | array of btctx state objects |
| getBTCHeadStateObjectsByBTCHeadId(btcHeadId, callback(err, stateObjects))     | gets all btchead state data for a given btchead id | array of btchead state objects |
| writeAggStateObject(stateObject, callback(err, success))     | write the agg state object to storage | boolean indicating success |
| writeCalStateObject(stateObject, callback(err, success))     | write the cal state object to storage | boolean indicating success |
| writeBTCTxStateObject(stateObject, callback(err, success))     | write the btctx state object to storage | boolean indicating success |
| writeBTCHeadStateObject(stateObject, callback(err, success))     | write the btchead state object to storage | boolean indicating success |

