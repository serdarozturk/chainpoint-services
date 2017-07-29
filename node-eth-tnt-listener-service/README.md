# TNT Token Listener

This service is responsible for listening to incoming transactions to a specified ETH address.  When the transaction comes in, the sender's address is looked up in the Nodes DB and their credit balance is updated with the additional amount they sent in.

## Configuration

The service requires two configurations to work.  First the address that the service should listen to should be exposed as an environment variable:
```
export ETH_TNT_LISTEN_ADDR=0x3b91312d098b2df13e053a971dbb154936963d44
```

Second, the built contract JSON files should be exposed in the `/contracts` folder.  In development, this is done through a docker volume but production can be handled differently if needed.

## Contract

The contracts are deployed through the migration and you can see the addresses that are being used:

```
Running migration: 2_deploy_token.js
  Deploying BCAPTestToken...
  BCAPTestToken: 0xc3718db80139a3d7ae881e63efbcfdb0366e3f91
Saving successful migration to network...
```

## Startup

This service waits 10 seconds before actually listening to allow for any contracts to be deployed.