# chainpoint-node-proof-gen-service

## Build and Run Locally

Build Container

```
docker build -t chainpoint/node-proof-gen-service .
```

Run Container Locally

```
docker run -p 49160:8080 -d chainpoint/node-proof-gen-service
```

Login To Local Container

```
docker ps
docker exec -it <container id> /bin/ash
```

