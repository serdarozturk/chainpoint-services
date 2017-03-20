# chainpoint-node-aggregator-service

## Build and Run Locally

Build Container

```
docker build -t chainpoint/node-aggregator-service .
```

Run Container Locally

```
docker run -p 49160:8080 -d chainpoint/node-aggregator-service
```

Open in Browser or Curl

```
curl http://127.0.0.1:49160/

open http://127.0.0.1:49160/
```

Micro Load Test w/ Apache Bench

```
ab -n 1000 -c 25 http://127.0.0.1:49160/
```

Login To Local Container

```
docker ps
docker exec -it <container id> /bin/ash
```
