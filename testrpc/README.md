# testrpc

Testrpc is an implementation of the Ethereum blockchain that is used for testing.  It will act like an ethereum node on a private blockchain and accept the JSON RPC requests that a full node would.  The blockchain will also be initialized with unlocked accounts and mine blocks immediately for any transactions that are submitted.

## Build Locally

Build Container

```
docker build -t chainpoint/testrpc .
```

Login

(`ctl-d` to exit)

```
docker run -it chainpoint/testrpc /bin/bash
```
