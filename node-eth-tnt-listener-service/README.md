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
  Deploying TierionNetworkToken...
  TierionNetworkToken: 0xc3718db80139a3d7ae881e63efbcfdb0366e3f91
Saving successful migration to network...
```

## Startup

This service waits 10 seconds before actually listening to allow for any contracts to be deployed.


## Manual Testing

First start by going into the `node-eth-contracts` dir and connecting to testrpc:
```
yarn console
```

Once in the console you can see a list of accounts that are available:

```
web3.eth.accounts
[ '0x93240f6f3d1ebfe17c7ea32d76594d94cf826986',
  '0x257b5620086ea74c241eb6c74453d77a712ced39',
  '0xbfe91cac1fa83b14c75af47f8c3e78a1aab1f7de',
  '0x112a3785bc606f9c5d6e002433d86844cb269afe',
  '0x5b778a80041c6afe8d0aa2888a14e85fc9adab84',
  '0x981c6e773f56a05befcd57b0356f2ddb8fcbca2c',
  '0x62e1f2b8c79220f0cb7cbaef7abbd2747039378c',
  '0x606d8fc99400dad5a3a4874685ba99b71409d00a',
  '0x5fe4f517dcb8061ebff178a0ef704e08699f4e5c',
  '0x2727ef2256bdc25f140fb1bc941f622576426145' ]
```

These are addresses that you can use for testing.  Pick any of them that is not the first.

```
web3.eth.accounts[2]
'0xa87d01b737e14e7be486c427a95c5058dc0ae0a7'
```

Then register this as a node:
```
curl -H "Content-Type: application/json" -X POST -d '{"tnt_addr":"0xdce8127f92f5a5082ef1ae0de95abfa955be3110"}' http://127.0.0.1/nodes

{
  "tnt_addr":"0xa87d01b737e14e7be486c427a95c5058dc0ae0a7",
  "hmac_key":"103ec57eb45839873684d09098eb24640d0af802d4f0389f6167d60ec3e1f65e"
}
```

Now that the node is registered, we can send some TNT token to that account.

First grab the contract address that was spit out when the listener node was started:
```
Using TNT Token contract at  0xceaf0d249fef4acefc37c4b3784bb83c15d90675
```

Next get a handle to the contract from the testrpc console:
```
TierionNetworkToken.at('0xceaf0d249fef4acefc37c4b3784bb83c15d90675').balanceOf(web3.eth.accounts[0])
{ [String: '100000000000000000'] s: 1, e: 17, c: [ 1000 ] }

TierionNetworkToken.at('0xceaf0d249fef4acefc37c4b3784bb83c15d90675').transfer(web3.eth.accounts[2], 4000000)

TierionNetworkToken.at('0xceaf0d249fef4acefc37c4b3784bb83c15d90675').balanceOf(web3.eth.accounts[2])
{ [String: '4000000'] s: 1, e: 6, c: [ 4000000 ] }
```

Now that account[2] has tokens, send them to the address that it being listened on.  This is set by an env var:
`ETH_TNT_LISTEN_ADDR=0x3b91312d098b2df13e053a971dbb154936963d44`

It is also printed out when the service starts up:
```
Listening for incoming TNT tokens to: 0x3b91312d098b2df13e053a971dbb154936963d4
```

Send it to the address from the account 2:
```
TierionNetworkToken.at('0xceaf0d249fef4acefc37c4b3784bb83c15d90675').transfer("0x3b91312d098b2df13e053a971dbb154936963d4", 5000, {from: web3.eth.accounts[2]})
```

You will see output:
```
Updating node 0xdce8127f92f5a5082ef1ae0de95abfa955be3110 with current credit 0 with amount 500000
```
