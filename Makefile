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

# create symbolic links to shared lib dir for convenience when testing
create-lib-links:
	@ln -sf "$(ROOT_DIR)node-lib/lib" "$(ROOT_DIR)node-aggregator-service"; \
	ln -sf "$(ROOT_DIR)node-lib/lib" "$(ROOT_DIR)node-api-service"; \
	ln -sf "$(ROOT_DIR)node-lib/lib" "$(ROOT_DIR)node-btc-fee-service"; \
	ln -sf "$(ROOT_DIR)node-lib/lib" "$(ROOT_DIR)node-btc-mon-service"; \
	ln -sf "$(ROOT_DIR)node-lib/lib" "$(ROOT_DIR)node-btc-tx-service"; \
	ln -sf "$(ROOT_DIR)node-lib/lib" "$(ROOT_DIR)node-calendar-service"; \
	ln -sf "$(ROOT_DIR)node-lib/lib" "$(ROOT_DIR)node-nist-beacon-service"; \
	ln -sf "$(ROOT_DIR)node-lib/lib" "$(ROOT_DIR)node-proof-gen-service"; \
	ln -sf "$(ROOT_DIR)node-lib/lib" "$(ROOT_DIR)node-proof-state-service"; \
	ln -sf "$(ROOT_DIR)node-lib/lib" "$(ROOT_DIR)node-splitter-service"

# copy the .env config from sample if not present
build-config:
	@[ ! -f ./.env ] && \
	cp .env.sample .env && \
	echo 'Copied config sample to .env' || true

# build the base image
build-base:
	@cd node-base; \
	docker build -t chainpoint/node-base:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag chainpoint/node-base:$(VERSION) chainpoint/node-base:latest

# build the shared lib intermediate image
build-lib: build-base
	@cd node-lib; \
	docker build -t chainpoint/node-lib:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag chainpoint/node-lib:$(VERSION) chainpoint/node-lib:latest

# build bcoin
build-bcoin: build-lib
	@cd bcoin; \
	docker build -t chainpoint/bcoin:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag chainpoint/bcoin:$(VERSION) chainpoint/bcoin:latest

# build aggregator
build-aggregator: build-lib
	@cd node-aggregator-service; \
	docker build -t chainpoint/node-aggregator-service:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag chainpoint/node-aggregator-service:$(VERSION) chainpoint/node-aggregator-service:latest

# build API
build-api: build-lib
	@cd node-api-service; \
	docker build -t chainpoint/node-api-service:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag chainpoint/node-api-service:$(VERSION) chainpoint/node-api-service:latest

# build btc-fee
build-btc-fee: build-lib
	@cd node-btc-fee-service; \
	docker build -t chainpoint/node-btc-fee-service:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag chainpoint/node-btc-fee-service:$(VERSION) chainpoint/node-btc-fee-service:latest

# build btc-mon
build-btc-mon: build-lib
	@cd node-btc-mon-service; \
	docker build -t chainpoint/node-btc-mon-service:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag chainpoint/node-btc-mon-service:$(VERSION) chainpoint/node-btc-mon-service:latest

# build btc-tx
build-btc-tx: build-lib
	@cd node-btc-tx-service; \
	docker build -t chainpoint/node-btc-tx-service:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag chainpoint/node-btc-tx-service:$(VERSION) chainpoint/node-btc-tx-service:latest

# build calendar
build-calendar: build-lib
	@cd node-calendar-service; \
	docker build -t chainpoint/node-calendar-service:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag chainpoint/node-calendar-service:$(VERSION) chainpoint/node-calendar-service:latest

# build NIST
build-nist: build-lib
	@cd node-nist-beacon-service; \
	docker build -t chainpoint/node-nist-beacon-service:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag chainpoint/node-nist-beacon-service:$(VERSION) chainpoint/node-nist-beacon-service:latest

# build proof-gen
build-proof-gen: build-lib
	@cd node-proof-gen-service; \
	docker build -t chainpoint/node-proof-gen-service:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag chainpoint/node-proof-gen-service:$(VERSION) chainpoint/node-proof-gen-service:latest

# build proof-state
build-proof-state: build-lib
	@cd node-proof-state-service; \
	docker build -t chainpoint/node-proof-state-service:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag chainpoint/node-proof-state-service:$(VERSION) chainpoint/node-proof-state-service:latest

# build splitter
build-splitter: build-lib
	@cd node-splitter-service; \
	docker build -t chainpoint/node-splitter-service:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag chainpoint/node-splitter-service:$(VERSION) chainpoint/node-splitter-service:latest

# build redis
build-redis: build-lib
	@cd redis; \
	docker build -t chainpoint/redis:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag chainpoint/redis:$(VERSION) chainpoint/redis:latest

# build telegraf
build-telegraf: build-lib
	@cd redis; \
	docker build -t chainpoint/telegraf:$(VERSION) --no-cache=$(NO_CACHE) . \
	&& docker tag chainpoint/telegraf:$(VERSION) chainpoint/telegraf:latest

# build all
build: build-lib build-bcoin build-aggregator build-api build-btc-fee build-btc-mon build-btc-tx build-calendar build-nist build-proof-gen build-proof-state build-splitter build-redis build-telegraf
	docker-compose build

# build all and start
up: bootstrap-node-modules create-lib-links build cockroachdb-setup
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

.PHONY: all cockroachdb-reset cockroachdb-setup bootstrap-node-modules create-lib-links build-config build-base build-lib build up down clean prune phoenix hey
