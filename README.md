# chainpoint-services

Chainpoint Services is a modern
[microservices architecture](https://martinfowler.com/articles/microservices.html) that implements the backend for the [chainpoint.org](https://chainpoint.org) proof engine.

The services provided are generally composed of Node.js applications
running within Alpine Linux Docker containers. These containers,
while intended to be run within a full Docker orchestration
system such as Kubernetes in production, run well on a single host
using [Docker Compose](https://docs.docker.com/compose/overview/). This run method is suitable for light production
use or while in development.

## Setup

This repository contains all of the code needed to
run the application stack locally.

To do so you'll only need a functional Docker environment.

On `macOS` the easiest way to install Docker is from the official
installation package which can be found [here](https://www.docker.com/docker-mac). When running
this will provide you with the `docker` and `docker-compose` commands that you'll need.

On Linux systems you may need to [install](https://docs.docker.com/compose/install/) `docker-compose` separately.

### Setup PATH

For your convenience we provide most of the dependencies you need as shell script wrappers
that let you use containerized applications with
no need to install them locally.

These wrappers are provided in the `./bin` directory.

You can execute them by calling them directly:

```
./bin/yarn -h
```

Or by adding the `./bin` directory to the
beginning of your `$PATH` environment variable.
This will ensure that these packaged commands, locked to the same versions we develop with,
will be used by you as well.

```
export PATH="$PWD/bin:$PATH"
```

You'll need to apply that `export` statement to
every open terminal shell you intend to use, or
you can add it to a config file like `~/.bash_profile`.

If you do add that directory to your path any
references to `./bin/COMMAND` that you see below
can be shorted to just the command name.

### Build Base Image

In dev build the base image first. `docker-compose`, even with
the `--build` flag won't do this build step for you.

```
cd node-base && docker build -t chainpoint/node-base:latest --no-cache=true .
```

### Build Shared Lib Image

In dev build the shared lib image. `docker-compose`, even with
the `--build` flag won't do this build step for you.

```
cd node-lib && docker build -t chainpoint/node-lib:latest --no-cache=true .
```

### Setup Environment Variables

Modify the `.env` file in the root of this repository to
provide `docker-compose` with the environment variables it
needs to get started.

### Setup CockroachDB

Run the following script to start a local dev CockroachDB cluster
and initialize it. This generally only needs to be done once unless
you remove the `./data/roach*` data directories.

```
./bin/cockroach-setup
```

## Service Startup & Shutdown

Startup all services daemonized and build all remaining service images as needed:

```
docker-compose up -d --build
```

Shutdown:

```
docker-compose down
```

View Logs:

```
docker-compose logs [servicename]
```

View Running Services:

```
docker-compose ps
```

## Testing

### Submit a Hash

```
curl -H "Content-Type: application/json" -X POST -d '{"hashes": ["bbf26fec613afd177da0f435042081d6e52dbcfe6ac3b83a53ea3e23926f75b4"]}' 127.0.0.1/hashes
```

sample output (prettified with [jq](https://stedolan.github.io/jq/)):

```
{
  "meta": {
    "submitted_at": "2017-06-09T20:39:54Z",
    "processing_hints": {
      "cal": "2017-06-09T20:40:54Z",
      "eth": "2017-06-09T20:50:54Z",
      "btc": "2017-06-09T21:40:54Z"
    }
  },
  "hashes": [
    {
      "hash_id": "cb1980c0-4d53-11e7-88fb-870abcce3652",
      "hash": "bbf26fec613afd177da0f435042081d6e52dbcfe6ac3b83a53ea3e23926f75b4"
    }
  ]
}
```

### Retrieve a Proof for a Hash ID

```
curl 127.0.0.1/proofs/cb1980c0-4d53-11e7-88fb-870abcce3652
```

sample output (prettified with [jq](https://stedolan.github.io/jq/)):

```
[
  {
    "hash_id": "cb1980c0-4d53-11e7-88fb-870abcce3652",
    "proof": {
      "@context": "https://w3id.org/chainpoint/v3",
      "type": "Chainpoint",
      "hash": "bbf26fec613afd177da0f435042081d6e52dbcfe6ac3b83a53ea3e23926f75b4",
      "hash_id": "cb1980c0-4d53-11e7-88fb-870abcce3652",
      "hash_submitted_at": "2017-06-09T20:39:54Z",
      "branches": [
        {
          "label": "cal_anchor_branch",
          "ops": [
            {
              "l": "cb1980c0-4d53-11e7-88fb-870abcce3652"
            },
            {
              "op": "sha-256"
            },
            {
              "l": "1497040740:4a36ee199dab91eaff325f0bb11bdae8334b7c417242ee9c9ef6037d4ac6a7e3bdbd2693f87156a459725d8b43db729e34f08b290d7c1a80136dfc14445a1f37"
            },
            {
              "op": "sha-256"
            },
            {
              "l": "3:1497040797308:1:cal:3"
            },
            {
              "r": "f20890f778b2f5452fbf5a1358dee62f1f4e68658bf7177e8cb28409fe47eb80"
            },
            {
              "op": "sha-256"
            },
            {
              "anchors": [
                {
                  "type": "cal",
                  "anchor_id": "3",
                  "uris": [
                    "http://a.cal.chainpoint.org/3/root",
                    "http://b.cal.chainpoint.org/3/root"
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  }
]
```

### Simple Load Test

To get a sense of the load this service can handle use
the [hey](https://github.com/rakyll/hey) load testing tool
to send hashes to your local running instance. You don't even
need to install it, we provide it via Docker for your
convenience.

Sending Hashes:

```
./bin/hey -m POST -H "Content-Type: application/json" -d '{"hashes": ["bbf26fec613afd177da0f435042081d6e52dbcfe6ac3b83a53ea3e23926f75b4"]}' -T 'application/json' -n 1000 -c 25 http://127.0.0.1/hashes
```

Retrieving Proofs:

```
./bin/hey -n 1000 -c 25 http://127.0.0.1/proofs/cb1980c0-4d53-11e7-88fb-870abcce3652
```


### Cleanup

```
# shutdown all services
docker-compose down

# remove all service data volumes
rm -rf ./data/*

# caution: remove *all* docker artifacts
docker container prune -f
docker image prune -f
docker volume prune -f
docker network prune -f
```
