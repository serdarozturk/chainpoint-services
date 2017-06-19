# chainpoint-node-btc-fee-service

Retrieve recommended Bitcoin fees for transactions from the
[https://bitcoinfees.21.co/api](https://bitcoinfees.21.co/api) API.

Cache the recommended fees from the API for a period of time to
avoid abuse of this third-party service.

Make this recommended fee available via Consul key
for consumption by interested services.
