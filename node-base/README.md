# chainpoint/node-base

The base Docker image for all Node.js based
services in chainpoint-services.

Inherit from this image in other `Dockerfile`
with:

```
FROM chainpoint/node-base

...
```

## Build Locally

Build Container

```
docker build -t chainpoint/node-base .
```

Login

(`ctl-d` to exit)

```
docker run -it chainpoint/node-base /bin/bash
```
