# chainpoint-node-proof-state-service

## Storage Adapters

Storage adapters allow the service to write to persistent storage. All adapters conform to a common interface, allowing easy code-based or programmatic switching between different storage providers.

The following is a description of methods that must be defined in a storage adapter: 

| Name           | Description  | Returns  |
| :------------- |:-------------|:-------------|
| openConnection(callback(err, success))       | opens the connection to the underlying storage provider | boolean indicating success |
| getStateObjectsByHashId(hashId, callback(err, stateObjects))     | gets all proof state data for a given hash id | array of proof state objects |
| writeStateObject(stateObject, callback(err, success))     | write the proof state object to storage | boolean indicating success |