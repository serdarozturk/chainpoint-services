# chainpoint-node-btc-fee-service

Retrieve recommended Bitcoin fees for transactions from the
[https://bitcoinfees.21.co/api](https://bitcoinfees.21.co/api) API.

Cache the recommended fees from the API for a period of time to
avoid abuse of this third-party service.

Make this recommended fee available at a well known Redis key
for consumption by interested services and also publish the
current recommended value to RabbitMQ.

## Build and Run Locally

Build Container

```
docker build -t chainpoint/node-btc-fee-service .
```

Run Container Locally

```
docker run -p 49160:8080 -d chainpoint/node-btc-fee-service
```

Login To Local Container

```
docker ps
docker exec -it <container id> /bin/ash
```

