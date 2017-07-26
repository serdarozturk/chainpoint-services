# Node ETH Monitoring Service

This service will be responsible for monitoring for incoming TNT token transactions.  If it finds an incoming transaction, it will update the credit in the DB associated with the node that sent it.

### Dev Env
To run in the dev env, you need to have `testrpc` running with the port exposed at 8545.  You must have the provider uri exposed as an env variable:
```
export ETH_PROVIDER_URI=http://localhost:8545
```

The contracts will need to be deployed to the blockchain:
```
truffle migrate
```

This should give you the address of the token contract:
```
Running migration: 2_deploy_token.js
  Deploying BCAPTestToken...
  BCAPTestToken: 0xc3718db80139a3d7ae881e63efbcfdb0366e3f91
Saving successful migration to network...
```

You then need to set the Token address as an env variable:
```
export ETH_TNT_TOKEN_ADDR=0xc3718db80139a3d7ae881e63efbcfdb0366e3f91
```

You can then manually send tokens:
```
npm run transferTokens -- 0x6a6d86907817db62e317bb21367f20e3802fbb66 1000
```

You should see:
```
Tokens have been transferred
Transaction: 0xafb7ea3c9ffa5b42f7d8a3b41369251990e1eb6aedf4851c6c204eb28cab6ff9
```

You can then verify the balance:
```
 npm run getBalance -- 0x6a6d86907817db62e317bb21367f20e3802fbb66
```

You should see:
```
Token balance of 0x6a6d86907817db62e317bb21367f20e3802fbb66 is 1000
```

You can also monitor for tokens being transferred to a specific account:
```
npm run watchTransfers -- 0x6a6d86907817db62e317bb21367f20e3802fbb66 0
```

You will see events printed to the screen:
```
Transfer occurred on Block 5 From: 0xfa55ebf21a12a414c7c37c641dd745638aaf5d86 To: 0x6a6d86907817db62e317bb21367f20e3802fbb66 AMT: 1000
```

## REST API

```
curl http://localhost:8085/balance/0x6a6d86907817db62e317bb21367f20e3802fbb66
```



```
curl -X POST \
  http://localhost:8085/transfer \
  -H 'cache-control: no-cache' \
  -H 'content-type: application/json' \
  -d '{ "to_addr": "0x6a6d86907817db62e317bb21367f20e3802fbb66", "value": "10000"}'
```