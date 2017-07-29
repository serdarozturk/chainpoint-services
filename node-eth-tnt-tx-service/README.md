# TNT Token Service

This service is responsible for interacting with the token contract.  It allows querying of the balance of any address and also sending tokens to any specified target address.

This is available through a REST based API. 

## Configuration

The built contract JSON files should be exposed in the `/contracts` folder.  In development, this is done through a docker volume but production can be handled differently if needed. 

The ETH node that is used should be configured to have an unlocked accout to allow outgoing transactions.

## REST API

To query the balance of an address:
```
curl http://localhost:8085/balance/0x6a6d86907817db62e317bb21367f20e3802fbb66
```


To transfer tokens to a specified address:
```
curl -X POST \
  http://localhost:8085/transfer \
  -H 'cache-control: no-cache' \
  -H 'content-type: application/json' \
  -d '{ "to_addr": "0x6a6d86907817db62e317bb21367f20e3802fbb66", "value": "10000"}'
```