# Chainpoint-ETH

This is proof of concept project to show how to interact with the Ethereum network via the web3 library.  The main goals will be:

* Deploy an ERC20 compliant token
* Trigger transfers of the ERC20 token
* Listen for Transfer events of the ERC20 token, targeting a specific address, and trigger an action when found
* Query a given ETH address for the current balance of the ERC20 token

## The ERC20 Token

The ERC20 Token source code was taken from the [BCAPToken Project](https://github.com/BCAPtoken/BCAPToken).  There are two main changes:

* Updated the Compiler version to `solidity ^0.4.11` to get latest security changes.
* Added the Name, Symbol, and Decimals public properties.

The main class is "BCAPTestToken.sol"

## Infrastructure

This project is based on the [Truffle Framework](http://truffleframework.com/).
To install truffle:
```
$ npm install -g truffle
```

## Generating a Wallet

To enable writing to the Ethereum network, a wallet is required to sign transactions.  A simple script is available to generate a new HD wallet from a 12 word mnemonic and save the first indexed wallet to a file in the top level folder (wallet.json).  The rest of the libraries/classes in this project will assume that the wallet.json file is available to use whenever a transaction needs to be sent.  The password to unlock the wallet.json file should be set as an environment variable `WALLET_PASSWORD`.

To generate a new wallet:
```
$ npm run generateWallet
```

You will be prompted to enter a password.  Save both the 12 word mnemonic and the wallet file password. To set the password as an env variable for the other scripts to use:
```
$ export WALLET_PASSWORD=mysecret
```

Also save off the wallet address that is printed to the console.  You will need to send testnet eth to this address.

## Running a Node

The easiest way to get a testing node up is to use Docker.  This will run a node on testnet:
```
$ docker pull pooleja/geth-testnet
$ docker run -p 8545:8545 pooleja/geth-testnet:latest
```

The node will take a while to sync with the network (expect 4 hours).

You can attach to the bash shell of the node to get on the geth console:
```
$ docker exec -i -t <CONTAINER_ID> /bin/bash
# geth attach ipc:/root/.ethereum/testnet/geth.ipc
```
From the geth console you can check if it is finished syncing:
```
> eth.syncing
false
```
If it is still syncing you will see stats about the sync instead of `false`.

Once it is up and running you will want to export an env variable so that scripts know which node to connect to for the ropsten network:
```
$ export PROVIDER_URI=http://localhost:8545
```

## Testing Locally

If you want to run this locally to play with, you can use TestRPC.  TestRPC is a JS implementation of a dev node that creates a fake blockchain with unlocked accounts and gives accounts test ETH to use.  TestRPC is instant and you do not need to sync with anything.  Any transactions submitted over TestRPC are automatically signed and a block is immediately "mined".

Install TestRPC
```
$ npm install -g ethereumjs-testrpc
```

Run TestRPC
```
$ testrpc
```

It will then be up and running.  You can deploy the contracts to TestRPC:
```
$ truffle migrate
```

You can then run any other scripts against it or open a console to interact with the blockchain:
```
$ truffle console
```

## Deploying the ERC20 Contract on the Ropsten Testnet

To deploy the Token Contract, you will need to have the following:

* Installed Truffle and npm dependencies
* Generated the wallet.json file
* Exported the password as an env variable to the wallet as WALLET_PASSWORD
* Started a node that can be connected to over RPC
* Exported the provider URI as an env variable to the ropsten node as PROVIDER_URI

The next step is to send ETH to the address listed when you generated your wallet.  ETH is required to send transactions as gas and to deploy the contracts.  You can get testnet eth from a [faucet](http://faucet.ropsten.be:3001/).

Once you have ETH in your account, then you can trigger the migration to write transactions to create the ERC20 Contract:
```
$ truffle migrate --network ropsten
```
This will take a few minutes for the transactions to get confirmed.

In the output of that command you will see the address of the new contract:
```
Running migration: 2_deploy_token.js
  Replacing BCAPTestToken...
  BCAPTestToken: 0x4C71ebb274047C6Ba76a3d81A071a6E56d5dc2b0
```

From here you can jump into the console to interact with it:
```
$ truffle console --network ropsten
Using this address for source: 0x2f994ca0aa2f3e972de8627718d33ecc181cd2bc
truffle(ropsten)> BCAPTestToken.at('0x4C71ebb274047C6Ba76a3d81A071a6E56d5dc2b0')
TruffleContract {
  ...
}
```

Once you have deployed the contract, you should export the contract address so that other scripts know where it lives:
```
$ export BCAP_TOKEN_ADDR=0x4c71ebb274047c6ba76a3d81a071a6e56d5dc2b0
```

## Transferring Tokens

Once the token contract is deployed to the network, you can send tokens to other addresses.  When the token is deployed, the address that is generated from the wallet.json file has the ability to send unlimited tokens to other addresses.

You can use a sample script to send tokens to another account:
```
$ npm run transferTokens -- 0x3c440dda39990372beeeb222715034e9b934f0f4 2000000000000000000

Tokens have been transferred
Transaction: 0xb63621a0f0bf22d62260c73d65c4c5d1384e9725af94fc33aa0d5794d5439b44
```

Web3 only supports async functions so it will immediately return with the transaction hash.  Before the tokens show up as transferred they need to get confirmed in a block (up to a minute).

## Checking Token Balance

Once tokens have been transferred to an address, you can query the balance.  This is a read-only operation so does not actually require a transaction, and just queries the smart contract on the local node.

```
$ npm run getBalance -- 0x3c440dda39990372beeeb222715034e9b934f0f4

Token balance of 0x3c440dda39990372beeeb222715034e9b934f0f4 is 5000000000010000000
```

## Watching for Incoming Token Transfers

When a transfer is initiated, the only logic that takes place is the ERC20 token contract is updated with new balances.  There is no incoming transaction to the target address.  When this takes place though, an Event is fired in the contract that can be watched:
```
  /**
   * Logged when tokens were transferred from one owner to another.
   *
   * @param _from address of the owner, tokens were transferred from
   * @param _to address of the owner, tokens were transferred to
   * @param _value number of tokens transferred
  */
  event Transfer (address indexed _from, address indexed _to, uint256 _value);
```

In the ETH APIs, you can monitor events and set filters for which events to be notified.  In this case, we are monitoring the `_to` address starting from a specified block.  Looking for all events starting from block 0 takes a while to process.  A production app would keep track of the last block it saw an event and start listening from there on next start up.  Listening for events does not trigger a transaction and is a read only action.

You can run the script to start listening for transfers:
```
$ npm run watchTransfers -- 0x3c440ddA39990372beEEb222715034e9b934f0f4 1300000

Listening for transfers to 0x3c440ddA39990372beEEb222715034e9b934f0f4 starting from block 1300000

Trasfer occurred on Block 1306784 From: 0x2f994ca0aa2f3e972de8627718d33ecc181cd2bc To: 0x3c440dda39990372beeeb222715034e9b934f0f4 AMT: 10000000
Trasfer occurred on Block 1306821 From: 0x2f994ca0aa2f3e972de8627718d33ecc181cd2bc To: 0x3c440dda39990372beeeb222715034e9b934f0f4 AMT: 1000000000000000000
Trasfer occurred on Block 1306896 From: 0x2f994ca0aa2f3e972de8627718d33ecc181cd2bc To: 0x3c440dda39990372beeeb222715034e9b934f0f4 AMT: 2000000000000000000
Trasfer occurred on Block 1306925 From: 0x2f994ca0aa2f3e972de8627718d33ecc181cd2bc To: 0x3c440dda39990372beeeb222715034e9b934f0f4 AMT: 2000000000000000000
```

## Environment Variables

These scripts require environment variables to be set as configuration.  In order to make things easier for development, it pulls in the `dotenv` library.  This will allow any variables set in a file named `.env` to be automatically set as environment vars when the app runs.  To make this work, just rename the ".env.template" file to ".env" and fill the vars with your settings.

```
$ cp .env.template .env
```

## Open Zeppelin

The contracts under `./contracts/zeppelin` are from the Open Zeppelin project.  These are open source contracts that should be used for the base of any contracts we need (if they are available).  These contracts are open source and used by many people in the field, so if they have problems, they should get fixed.

The `NRNToken.sol` class inherits from the Zeppelin token classes to handle ERC20 basics.