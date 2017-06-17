# First target in the Makefile is the default.
all: up
default: up

# Get the location of this makefile.
ROOT_DIR := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))

REQUIRED_BINS := docker docker-compose
$(foreach bin,$(REQUIRED_BINS),\
    $(if $(shell command -v $(bin) 2> /dev/null),$(info Found `$(bin)`),$(error Please install `$(bin)`)))

# Help Text Display
# Usage: Put a comment with double # prior to targets.
# See : https://gist.github.com/rcmachado/af3db315e31383502660
## Display this help text
help: 
	$(info Available targets)
	@awk '/^[a-zA-Z\-\_0-9]+:/ {                    \
		nb = sub( /^## /, "", helpMsg );            \
		if(nb == 0) {                               \
		helpMsg = $$0;                              \
		nb = sub( /^[^:]*:.* ## /, "", helpMsg );   \
		}                                           \
		if (nb)                                     \
		print  $$1 "\t" helpMsg;                    \
	}                                               \
	{ helpMsg = $$0 }'                              \
	$(MAKEFILE_LIST) | column -ts $$'\t' |          \
	grep --color '^[^ ]*'

# a SemVer version tag to apply to all built docker images
VERSION ?= "v0.0.1"

# skip use of Docker cache when building images?
NO_CACHE ?= false

## Bring the system down, delete CDB data, setup DB as needed, and start cluster
cockroachdb-reset: down
	./bin/cockroach-setup -d

cockroachdb-setup:
	./bin/cockroach-setup

## Copy the .env config from sample if not present
build-config:
	@[ ! -f ./.env ] && \
	cp .env.sample .env && \
	echo 'Copied config sample to .env' || true

## Build the base image
build-base:
	@cd node-base; \
	docker build -t quay.io/chainpoint/node-base:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag quay.io/chainpoint/node-base:$(VERSION) quay.io/chainpoint/node-base:latest

## Build the shared lib image
build-lib: build-base
	@cd node-lib; \
	docker build -t quay.io/chainpoint/node-lib:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag quay.io/chainpoint/node-lib:$(VERSION) quay.io/chainpoint/node-lib:latest

## Build bcoin
build-bcoin: build-lib
	@cd bcoin; \
	docker build -t quay.io/chainpoint/bcoin:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag quay.io/chainpoint/bcoin:$(VERSION) quay.io/chainpoint/bcoin:latest

## Build aggregator
build-aggregator: build-lib
	@cd node-aggregator-service; \
	docker build -t quay.io/chainpoint/node-aggregator-service:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag quay.io/chainpoint/node-aggregator-service:$(VERSION) quay.io/chainpoint/node-aggregator-service:latest

## Build aggregator test runner
build-aggregator-test: build-aggregator
	@cd node-aggregator-service; \
	docker build -t quay.io/chainpoint/node-aggregator-service-test:$(VERSION) -f Dockerfile.test --no-cache=$(NO_CACHE) . \
	&& docker tag quay.io/chainpoint/node-aggregator-service-test:$(VERSION) quay.io/chainpoint/node-aggregator-service-test:latest

## Build API
build-api: build-lib
	@cd node-api-service; \
	docker build -t quay.io/chainpoint/node-api-service:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag quay.io/chainpoint/node-api-service:$(VERSION) quay.io/chainpoint/node-api-service:latest

## Build API test runner
build-api-test: build-api
	@cd node-api-service; \
	docker build -t quay.io/chainpoint/node-api-service-test:$(VERSION) -f Dockerfile.test --no-cache=$(NO_CACHE) . \
	&& docker tag quay.io/chainpoint/node-api-service-test:$(VERSION) quay.io/chainpoint/node-api-service-test:latest

## Build btc-fee
build-btc-fee: build-lib
	@cd node-btc-fee-service; \
	docker build -t quay.io/chainpoint/node-btc-fee-service:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag quay.io/chainpoint/node-btc-fee-service:$(VERSION) quay.io/chainpoint/node-btc-fee-service:latest

## Build btc-mon
build-btc-mon: build-lib
	@cd node-btc-mon-service; \
	docker build -t quay.io/chainpoint/node-btc-mon-service:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag quay.io/chainpoint/node-btc-mon-service:$(VERSION) quay.io/chainpoint/node-btc-mon-service:latest

## Build btc-tx
build-btc-tx: build-lib
	@cd node-btc-tx-service; \
	docker build -t quay.io/chainpoint/node-btc-tx-service:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag quay.io/chainpoint/node-btc-tx-service:$(VERSION) quay.io/chainpoint/node-btc-tx-service:latest

## Build calendar
build-calendar: build-lib
	@cd node-calendar-service; \
	docker build -t quay.io/chainpoint/node-calendar-service:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag quay.io/chainpoint/node-calendar-service:$(VERSION) quay.io/chainpoint/node-calendar-service:latest

## Build cockroach-health-proxy
build-cockroach-health-proxy: build-base
	@cd cockroach-health-proxy; \
	docker build -t quay.io/chainpoint/node-cockroach-health-proxy-service:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag quay.io/chainpoint/node-cockroach-health-proxy-service:$(VERSION) quay.io/chainpoint/node-cockroach-health-proxy-service:latest

## Build NIST
build-nist: build-lib
	@cd node-nist-beacon-service; \
	docker build -t quay.io/chainpoint/node-nist-beacon-service:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag quay.io/chainpoint/node-nist-beacon-service:$(VERSION) quay.io/chainpoint/node-nist-beacon-service:latest

## Build proof-gen
build-proof-gen: build-lib
	@cd node-proof-gen-service; \
	docker build -t quay.io/chainpoint/node-proof-gen-service:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag quay.io/chainpoint/node-proof-gen-service:$(VERSION) quay.io/chainpoint/node-proof-gen-service:latest

## Build proof-state
build-proof-state: build-lib
	@cd node-proof-state-service; \
	docker build -t quay.io/chainpoint/node-proof-state-service:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag quay.io/chainpoint/node-proof-state-service:$(VERSION) quay.io/chainpoint/node-proof-state-service:latest

## Build splitter
build-splitter: build-lib
	@cd node-splitter-service; \
	docker build -t quay.io/chainpoint/node-splitter-service:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag quay.io/chainpoint/node-splitter-service:$(VERSION) quay.io/chainpoint/node-splitter-service:latest

## Build splitter test runner
build-splitter-test: build-splitter
	@cd node-splitter-service; \
	docker build -t quay.io/chainpoint/node-splitter-service-test:$(VERSION) -f Dockerfile.test --no-cache=$(NO_CACHE) . \
	&& docker tag quay.io/chainpoint/node-splitter-service-test:$(VERSION) quay.io/chainpoint/node-splitter-service-test:latest

## Build redis
build-redis: build-lib
	@cd redis; \
	docker build -t quay.io/chainpoint/redis:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag quay.io/chainpoint/redis:$(VERSION) quay.io/chainpoint/redis:latest

## Build telegraf
build-telegraf: build-lib
	@cd redis; \
	docker build -t quay.io/chainpoint/telegraf:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag quay.io/chainpoint/telegraf:$(VERSION) quay.io/chainpoint/telegraf:latest

## Build all
build: build-lib build-bcoin build-aggregator build-api build-btc-fee build-btc-mon build-btc-tx build-calendar build-nist build-proof-gen build-proof-state build-splitter build-redis build-telegraf
	docker-compose build

## Run API test suite with Mocha
run-api-test: build-api-test
	docker run --tty=true --rm quay.io/chainpoint/node-api-service-test

## Run aggregator test suite with Mocha
run-aggregator-test: build-aggregator-test
	docker run --tty=true --rm quay.io/chainpoint/node-aggregator-service-test

## Run splitter test suite with Mocha
run-splitter-test: build-splitter-test
	docker run --tty=true --rm quay.io/chainpoint/node-splitter-service-test

## Run a small load test submitting hashes
run-load-test:
	./bin/hey -m POST -H "Content-Type: application/json" \
	-d '{"hashes": ["bbf26fec613afd177da0f435042081d6e52dbcfe6ac3b83a53ea3e23926f75b4"]}' \
	-T 'application/json' \
	-n 1000 \
	-c 25 \
	http://127.0.0.1/hashes

## Build all and start (default)
up: build cockroachdb-setup
	docker-compose up -d --build

## Shutdown Application
down:
	docker-compose down

## Tail application logs
logs:
	docker-compose logs -f

## Shutdown and destroy all local application data
clean: down
	@rm -rf ./data/*

## Shutdown and destroy all docker assets
prune: down
	docker container prune -f
	docker image prune -f
	docker volume prune -f
	docker network prune -f	

## Burn it all down and rise from the ashes
phoenix: clean prune cockroachdb-reset up

.PHONY: all default cockroachdb-reset cockroachdb-setup run-api-test run-aggregator-test run-splitter-test run-load-test build-config build-base build-lib build up down clean prune phoenix
