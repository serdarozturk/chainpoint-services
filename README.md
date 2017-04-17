# chainpoint-services

Chainpoint services is a modern scalable microservices architecture
based on Node.js services running on Docker containers. These containers
are intended to be hosted within a full Docker container orchestration
system such as Kubernetes for production use. For light hashing or
development the entire environment can be spun-up on a single host
using `docker-compose up`.

## Setup

This repository contains all of the code for the full
microservice application stack for running chainpoint-services
locally.

To run locally you will need the following dependencies in place:

- the `rake` utility, installed by default on `macOS`. You may
need to install Ruby first on other platforms.

- the `yarn` JavaScript package manager. Can be installed via `homebrew` on `macOS` with `brew install yarn`. More info on installing and using
Homebrew can be found at [https://brew.sh/](https://brew.sh/).

- the `jq` JSON tool. Can be installed via `homebrew` on `macOS` with `brew install jq`. You can pipe JSON output from curl to this command for pretty printing JSON results.

- a fully functional Docker environment. If you are using `macOS` the easiest way is to install Docker is from the official installation package which can be found at [https://www.docker.com/docker-mac](https://www.docker.com/docker-mac).

## Build

Build and install all service docker images into your local Docker
environment. This command Will use `yarn` to install any JavaScript
dependencies for each service and will then build the full suite of
Docker images.

```
rake
```

## Start w/ Docker Compose

Foreground:

```
docker compose up
```

Stop w/ `control-c` (`docker-compose down` is sometimes necessary)


Daemonized:

```
docker compose up -d
```

Stop w/ `docker-compose down`

## Test Running Services

```
curl -H "Content-Type: application/json" -X POST -d '{"hashes": ["bbf26fec613afd177da0f435042081d6e52dbcfe6ac3b83a53ea3e23926f75b4"]}' 127.0.0.1:8080/hashes | jq
```

## Lite Local Load Test

Install the `hey` load testing tool. [https://github.com/rakyll/hey](https://github.com/rakyll/hey)

```
hey -m POST -H "Content-Type: application/json" -d '{"hashes": ["bbf26fec613afd177da0f435042081d6e52dbcfe6ac3b83a53ea3e23926f75b4"]}' -T 'application/json' -n 1000 -c 25 -cpus 3 http://127.0.0.1:8080/hashes

```

## Cleanup

You can cleanup all installed Docker containers by stopping
the containers and then running `rake prune:all`. Use caution
as this will remove *all* installed Docker containers, images,
volumes, and networks from your local docker install.

The following `prune` options are also available:

```
$ rake -T
...
rake prune:all
rake prune:containers
rake prune:images
rake prune:networks
rake prune:volumes
...
```
