# chainpoint-services

Chainpoint services is a modern scalable microservices architecture
based on Node.js services running on Docker containers. These containers
are intended to be hosted within a full Docker container orchestration
system such as Kubernetes for production use. For light hashing or
development the entire environment can be spun-up on a single host
using `docker-compose up`.

## Setup

This repository contains all of the code for the full microservice
application stack for running chainpoint-services locally.

To run locally you will need the following dependencies in place:

- a fully functional Docker environment. If you are using `macOS` the easiest way is to install Docker is from the official installation package which can be found at [https://www.docker.com/docker-mac](https://www.docker.com/docker-mac).

### Optional

- the `yarn` JavaScript package manager. Can be installed via `homebrew` on `macOS` with `brew install yarn`. More info on installing and using
Homebrew can be found at [https://brew.sh/](https://brew.sh/).

- the `jq` JSON tool. Can be installed via `homebrew` on `macOS` with `brew install jq`. You can pipe JSON output from curl to this command for pretty printing JSON results.

## Build

Build and install all Chainpoint service docker images in your Docker
environment.

```
# In dev build the base image first. docker-compose won't do this:
cd node-base && docker build -t chainpoint/node-base:latest --no-cache=true .

docker-compose build
```

## Start w/ Docker Compose

Running in the Foreground:

```
docker compose up
```

Stop w/ `control-c` (`docker-compose down` is sometimes necessary)


Running Daemonized:

```
docker compose up -d
```

Stop w/ `docker-compose down`

## Test Running Services

```
curl -H "Content-Type: application/json" -X POST -d '{"hashes": ["bbf26fec613afd177da0f435042081d6e52dbcfe6ac3b83a53ea3e23926f75b4"]}' 127.0.0.1/hashes | jq
```

## Lite Local Load Test

Install the `hey` load testing tool. [https://github.com/rakyll/hey](https://github.com/rakyll/hey)

```
hey -m POST -H "Content-Type: application/json" -d '{"hashes": ["bbf26fec613afd177da0f435042081d6e52dbcfe6ac3b83a53ea3e23926f75b4"]}' -T 'application/json' -n 1000 -c 25 http://127.0.0.1/hashes

```

## Cleanup

You can cleanup all installed Docker containers by stopping
the containers and then running the various `prune` commands.
Use caution as this will remove *all* installed Docker containers,
images, volumes, or networks from your local docker system.

```
docker container prune -f
docker image prune -f
docker volume prune -f
docker network prune -f
```
