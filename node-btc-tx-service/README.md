# chainpoint-node-btc-tx-service

## Build and Run Locally

Build Container

```
docker build -t chainpoint/node-btc-tx-service .
```

Run Container Locally

```
docker run -p 49160:8080 -d chainpoint/node-btc-tx-service
```

Login To Local Container

```
docker ps
docker exec -it <container id> /bin/ash
```

