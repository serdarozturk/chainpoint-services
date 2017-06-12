# chainpoint-node-btc-fee-service

Retrieve recommended Bitcoin fees for transactions from the
[https://bitcoinfees.21.co/api](https://bitcoinfees.21.co/api) API.

Cache the recommended fees from the API for a period of time to
avoid abuse of this third-party service.

Make this recommended fee available at a well known Redis key
for consumption by interested services and also publish the
current recommended value to RabbitMQ.
