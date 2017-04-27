# chainpoint-node-nist-beacon-service

Retrieve records from the 
[NIST Randomness Beacon Service](https://www.nist.gov/programs-projects/nist-randomness-beacon) API
and cache them for use in the Chainpoint Calendar service.

Caches results under well known Redis keys
for consumption by interested services.

## Build and Run Locally

Build Container

```
docker build -t chainpoint/node-nist-beacon-service .
```

Run Container Locally

```
docker run -p 49160:8080 -d chainpoint/node-nist-beacon-service
```

Login To Local Container

```
docker ps
docker exec -it <container id> /bin/ash
```

