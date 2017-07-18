# chainpoint-services

Chainpoint Services is the Core of the Tierion Network and
a modern [microservices architecture](https://martinfowler.com/articles/microservices.html)
that implements the [chainpoint.org](https://chainpoint.org) API.

The services provided are generally composed of Node.js applications
running within Alpine Linux Docker containers. These containers,
while intended to be run within a full Docker orchestration
system such as Kubernetes in production, run well on a single host
using [Docker Compose](https://docs.docker.com/compose/overview/).
This run method is suitable for light production use and development.

## TL;DR

Build and start the whole system locally. After the first run of `make` try `make help`
to see additional helper commands available. Shut it all down with `make down`.

```
git clone https://github.com/chainpoint/chainpoint-services
cd chainpoint-services
make
```

## Getting Started

This repository contains all of the code needed to
run the full application stack locally.

To do so you'll only need a functional Docker environment with the `docker`
and `docker-compose` commands available. In addition you'll need the `make`
utility.

On `macOS` the easiest way to install Docker is from the official
installation package which can be found [here](https://www.docker.com/docker-mac).

On Linux systems you may need to [install](https://docs.docker.com/compose/install/) `docker-compose`
separately in addition to Docker.

### Setup PATH

For your convenience we provide most of the other dependencies you might need
as shell script wrappers that let you use containerized applications
with no need to install them locally.

These wrappers are provided in the `./bin` directory.

You can execute them by calling them directly:

```
./bin/yarn -h
```

Or by adding the `./bin` directory to the beginning of your `$PATH`
environment variable. This will ensure that these packaged commands,
which will be locked to the same versions we developed with, will
be available to you as well.

```
export PATH="$PWD/bin:$PATH"
```

You'll need to apply that `export` statement to
every open terminal shell you intend to use, or
you can add it to a config file like `~/.bash_profile`.

If you do add that directory to your path any
references to `./bin/COMMAND` that you see below
can be shorted to just the command name.

### Setup Environment Variables

You will need ot set up environment variables before building.

Running `make build-config` will copy `.env.sample` to `.env`. This file will be used by `docker-compose` to set required environment variables.

You can modify the `.env` as needed, any changes will be ignored by Git.

## Startup

Running `make` should build and start all services for you.

## Examples

The following examples use `curl` to submit requests.

### Submit a Hash

Once the environment is running you can start submitting hashes to be anchored.

```
curl -s -H "Content-Type: application/json" -X POST -d '{"hashes": ["bbf26fec613afd177da0f435042081d6e52dbcfe6ac3b83a53ea3e23926f75b4"]}' 127.0.0.1/hashes
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

### Retrieve a Base64 encoded Binary Proof for a Hash ID

Proofs can be retrieved in the supported
[Chainpoint binary](https://github.com/chainpoint/chainpoint-binary) format by passing
an appropriate `Accept` header with your request.

```
curl -s -H 'Accept: application/vnd.chainpoint.api.v1.base64+json' 127.0.0.1/proofs/cb1980c0-4d53-11e7-88fb-870abcce3652
```

sample output (prettified with [jq](https://stedolan.github.io/jq/)):

```
[
  {
    "hash_id": "358d14f0-4e2e-11e7-87be-37208b69c348",
    "proof": "eJyNUruO1EAQ/BkIvZ7unqejlfgFIpLVPHqwpWVt2T4e4YJEQnREpMct2oPsJFL4j/0bxnunQxAg0prqruqaen+zjv1u5tfzz3aeh6mp61fUpVU/Pq9j67vd0He7uX5Jh/nNwN+ePECH1k/taR1CRp05aiCfExiTvMiSlJAoLCTNClOImbWPFCx5ReyJkVyZMirI47Jm06XTI1I2gcyikoxcAbCprAlckSmbgnaRpL09s6eL8KKbZ04bP39HAaYSugLxFLGR1CA9uwmj38WWp8u3X7Y+8PY2+u1mgfpxc/d23Q/Tp/3V9v9095/74Ti1vkKll6EPIJ0BkgpFkzPoxGicDtqqoKRIiWxSSRPGgFEKg+AzOy1jEp6cR19Sk6SlxTJmSzYW2QrwwumEZQtlxSpFJXKOYIMDQTpQSpmVI0ghg0Qgo1RO6m9vP4o12dz708Ipogaacv+Cyf3VeFpnH3S5OIrolHDlesHSWoxkyj8Za0xBjXVBowflRHEEwaOUicEb1n8qHu9inS7fnRtyXZS+3ifdpcOiebgYu+nj6fHSr1IvvyqU1e9unau28Oqx7+cHWvgn7RdSPeSX"
  }
]
```

### Retrieve a JSON-LD Proof for a Hash ID

```
curl -s 127.0.0.1/proofs/cb1980c0-4d53-11e7-88fb-870abcce3652
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
      "hash_id_node": "cb1980c0-4d53-11e7-88fb-870abcce3652", 
      "hash_submitted_node_at": "2017-06-09T20:39:54Z", 
      "hash_id_core": "cb1980c0-4d53-11e7-88fb-870abcce3652",
      "hash_submitted_core_at": "2017-06-09T20:39:54Z",
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
                    "http://a.cal.chainpoint.org/3/hash"
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

### Verify a Proof

```
curl -X POST \
  http://104.198.1.217/verify \
  -H 'cache-control: no-cache' \
  -H 'content-type: application/json' \
  -d '{
    "proofs": [
        {
            "@context": "https://w3id.org/chainpoint/v3",
            "type": "Chainpoint",
            "hash": "bbf26fec613afd177da0f435042081d6e52dbcfe6ac3b83a53ea3e23926f75b4",
            "hash_id_node": "cb1980c0-4d53-11e7-88fb-870abcce3652", 
            "hash_submitted_node_at": "2017-06-09T20:39:54Z", 
            "hash_id_core": "cb1980c0-4d53-11e7-88fb-870abcce3652",
            "hash_submitted_core_at": "2017-06-09T20:39:54Z",
            "branches": [{
                "label": "cal_anchor_branch",
                "ops": [{
                    "l": "69b06800-4e23-11e7-87be-37208b69c348"
                }, {
                    "op": "sha-256"
                }, {
                    "l": "1497129900:58a0e3c8b0411b2b394a72633621d8fe232be71fd80513007f8cfd48db1da3025496ac6497c191598d0a1af3254d90e90e7e000a8df73319e04f0e538c834a53"
                }, {
                    "op": "sha-256"
                }, {
                    "l": "1408:1497129967524:1:cal:1408"
                }, {
                    "r": "aa9ab1c2d4a794f00594ce61ef208abfabf6e1dbb181692241b8679d3700bea7"
                }, {
                    "op": "sha-256"
                }, {
                    "anchors": [{
                        "type": "cal",
                        "anchor_id": "1408",
                        "uris": ["http://a.cal.chainpoint.org/1408/root", "http://b.cal.chainpoint.org/1408/root"]
                    }]
                }]
            }]
        }
    ]
}'
```

sample output (prettified with [jq](https://stedolan.github.io/jq/)):

```
[
    {
        "proof_index": 0,
        "hash": "bbf26fec613afd177da0f435042081d6e52dbcfe6ac3b83a53ea3e23926f75b4",
        "hash_id_node": "cb1980c0-4d53-11e7-88fb-870abcce3652", 
        "hash_submitted_node_at": "2017-06-09T20:39:54Z", 
        "hash_id_core": "cb1980c0-4d53-11e7-88fb-870abcce3652",
        "hash_submitted_core_at": "2017-06-09T20:39:54Z",
        "anchors": [
            {
                "branch": "cal_anchor_branch",
                "type": "cal",
                "valid": true
            }
        ],
        "status": "verified"
    }
]
```
