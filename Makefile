# Get the location of this makefile.
ROOT_DIR := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))

REQUIRED_BINS := docker docker-compose
$(foreach bin,$(REQUIRED_BINS),\
    $(if $(shell command -v $(bin) 2> /dev/null),$(info Found `$(bin)`),$(error Please install `$(bin)`)))

# makefile-help
ifneq ($(wildcard ./node_modules),)
  include ./node_modules/makefile-help/Makefile
endif

# a SemVer version tag to apply to all built docker images
VERSION ?= "v0.0.1"

# skip use of Docker cache when building images?
NO_CACHE ?= false

all: up

# bring the system down, delete CDB data, setup DB as needed, and start cluster
cockroachdb-reset: down
	./bin/cockroach-setup -d

cockroachdb-setup:
	./bin/cockroach-setup

# install top level npm packages
bootstrap-node-modules:
	./bin/yarn

# copy the .env config from sample if not present
build-config:
	@[ ! -f ./.env ] && \
	cp .env.sample .env && \
	echo 'Copied config sample to .env' || true

# build the base image
build-base:
	@cd node-base; \
	docker build -t quay.io/chainpoint/node-base:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag quay.io/chainpoint/node-base:$(VERSION) quay.io/chainpoint/node-base:latest

# build the shared lib intermediate image
build-lib: build-base
	@cd node-lib; \
	docker build -t quay.io/chainpoint/node-lib:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag quay.io/chainpoint/node-lib:$(VERSION) quay.io/chainpoint/node-lib:latest

# build bcoin
build-bcoin: build-lib
	@cd bcoin; \
	docker build -t quay.io/chainpoint/bcoin:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag quay.io/chainpoint/bcoin:$(VERSION) quay.io/chainpoint/bcoin:latest

# build aggregator
build-aggregator: build-lib
	@cd node-aggregator-service; \
	docker build -t quay.io/chainpoint/node-aggregator-service:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag quay.io/chainpoint/node-aggregator-service:$(VERSION) quay.io/chainpoint/node-aggregator-service:latest

# build API
build-api: build-lib
	@cd node-api-service; \
	docker build -t quay.io/chainpoint/node-api-service:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag quay.io/chainpoint/node-api-service:$(VERSION) quay.io/chainpoint/node-api-service:latest

# build API test runner
build-api-test: build-api
	@cd node-api-service; \
	docker build -t quay.io/chainpoint/node-api-service-test:$(VERSION) -f Dockerfile.test --no-cache=$(NO_CACHE) . \
	&& docker tag quay.io/chainpoint/node-api-service-test:$(VERSION) quay.io/chainpoint/node-api-service-test:latest

# run API test suite with Mocha
run-api-test: build-api-test
	docker run --rm quay.io/chainpoint/node-api-service-test

# build btc-fee
build-btc-fee: build-lib
	@cd node-btc-fee-service; \
	docker build -t quay.io/chainpoint/node-btc-fee-service:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag quay.io/chainpoint/node-btc-fee-service:$(VERSION) quay.io/chainpoint/node-btc-fee-service:latest

# build btc-mon
build-btc-mon: build-lib
	@cd node-btc-mon-service; \
	docker build -t quay.io/chainpoint/node-btc-mon-service:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag quay.io/chainpoint/node-btc-mon-service:$(VERSION) quay.io/chainpoint/node-btc-mon-service:latest

# build btc-tx
build-btc-tx: build-lib
	@cd node-btc-tx-service; \
	docker build -t quay.io/chainpoint/node-btc-tx-service:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag quay.io/chainpoint/node-btc-tx-service:$(VERSION) quay.io/chainpoint/node-btc-tx-service:latest

# build calendar
build-calendar: build-lib
	@cd node-calendar-service; \
	docker build -t quay.io/chainpoint/node-calendar-service:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag quay.io/chainpoint/node-calendar-service:$(VERSION) quay.io/chainpoint/node-calendar-service:latest

# build NIST
build-nist: build-lib
	@cd node-nist-beacon-service; \
	docker build -t quay.io/chainpoint/node-nist-beacon-service:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag quay.io/chainpoint/node-nist-beacon-service:$(VERSION) quay.io/chainpoint/node-nist-beacon-service:latest

# build proof-gen
build-proof-gen: build-lib
	@cd node-proof-gen-service; \
	docker build -t quay.io/chainpoint/node-proof-gen-service:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag quay.io/chainpoint/node-proof-gen-service:$(VERSION) quay.io/chainpoint/node-proof-gen-service:latest

# build proof-state
build-proof-state: build-lib
	@cd node-proof-state-service; \
	docker build -t quay.io/chainpoint/node-proof-state-service:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag quay.io/chainpoint/node-proof-state-service:$(VERSION) quay.io/chainpoint/node-proof-state-service:latest

# build splitter
build-splitter: build-lib
	@cd node-splitter-service; \
	docker build -t quay.io/chainpoint/node-splitter-service:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag quay.io/chainpoint/node-splitter-service:$(VERSION) quay.io/chainpoint/node-splitter-service:latest

# build redis
build-redis: build-lib
	@cd redis; \
	docker build -t quay.io/chainpoint/redis:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag quay.io/chainpoint/redis:$(VERSION) quay.io/chainpoint/redis:latest

# build telegraf
build-telegraf: build-lib
	@cd redis; \
	docker build -t quay.io/chainpoint/telegraf:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag quay.io/chainpoint/telegraf:$(VERSION) quay.io/chainpoint/telegraf:latest

# build all
build: build-lib build-bcoin build-aggregator build-api build-btc-fee build-btc-mon build-btc-tx build-calendar build-nist build-proof-gen build-proof-state build-splitter build-redis build-telegraf
	docker-compose build

# build all and start
up: bootstrap-node-modules build cockroachdb-setup
	docker-compose up -d --build

# shutdown
down:
	docker-compose down

# tail docker-compose logs
logs:
	docker-compose logs -f

# shutdown and destroy all local app data
clean: down
	@rm -rf ./data/*

# shutdown and destroy all docker assets
prune: down
	docker container prune -f
	docker image prune -f
	docker volume prune -f
	docker network prune -f	

# burn it all down and rise from the ashes
phoenix: clean prune cockroachdb-reset up

# run a quick load test submitting hashes
hey:
	./bin/hey -m POST -H "Content-Type: application/json" \
	-d '{"hashes": ["bbf26fec613afd177da0f435042081d6e52dbcfe6ac3b83a53ea3e23926f75b4"]}' \
	-T 'application/json' \
	-n 1000 \
	-c 25 \
	http://127.0.0.1/hashes

.PHONY: all cockroachdb-reset cockroachdb-setup bootstrap-node-modules run-api-test build-config build-base build-lib build up down clean prune phoenix hey
