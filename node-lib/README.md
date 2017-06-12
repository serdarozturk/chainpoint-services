# chainpoint-node-lib

Shared Javascript files for use by all node app containers.

## Build and Run Locally

Build Container

```
docker build -t chainpoint/node-lib .
```

Run Container Locally

```
docker run -p 49160:8080 -d chainpoint/node-lib
```

Login To Local Container

```
docker run --interactive --tty --rm chainpoint/node-lib:latest /bin/ash
```
