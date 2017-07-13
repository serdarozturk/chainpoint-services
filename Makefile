# First target in the Makefile is the default.
all: up

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

# A tag to apply to all locally built Docker images
# Apply 'latest' to build locally since each Dockerfile
# FROM command looks for `latest` by default.
TAG ?= "latest"

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

## Build all
build:
	./bin/docker-make --no-push
	docker container prune -f
	docker-compose build

## Pull Docker images
pull:
	docker-compose pull

## Push Docker images using docker-make
push:
	./bin/docker-make

## Run API test suite with Mocha
test-api: cockroachdb-setup
	./bin/docker-make --no-push node-api-service-test
	CHAINPOINT_STACK_ID=test CHAINPOINT_BASE_URI=http://test.chainpoint.org docker-compose up --build api-test

## Run aggregator test suite with Mocha
test-aggregator:
	./bin/docker-make --no-push node-aggregator-service-test
	docker-compose up --build aggregator-test

## Run splitter test suite with Mocha
test-splitter:
	./bin/docker-make --no-push node-splitter-service-test
	docker-compose up --build splitter-test

## Run a small load test submitting hashes
run-load-test:
	./bin/hey -m POST -H "Content-Type: application/json" \
	-d '{"hashes": ["bbf26fec613afd177da0f435042081d6e52dbcfe6ac3b83a53ea3e23926f75b4"]}' \
	-T 'application/json' \
	-n 1000 \
	-c 25 \
	http://127.0.0.1/hashes

## Run all application tests
test: test-api test-aggregator test-splitter 

## Build and start all
up: build cockroachdb-setup
	docker-compose up -d --build

## Startup without performing builds, rely on pull of images. Set DOCKER_TAG
up-no-build: pull cockroachdb-setup
	docker-compose up -d --no-build

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
	docker image prune -f -a
	docker volume prune -f
	docker network prune -f

## Shutdown and destroy all docker assets using the older method
prune-oldskool: down
	docker rm $(docker ps -a -f status=exited -q)
	docker rmi $(docker images -f dangling=true -q)
	docker volume rm $(docker volume ls -f dangling=true -q)

## Burn it all down and destroy the data. Start it again yourself!
burn: clean prune
	@echo ""
	@echo "****************************************************************************"
	@echo "Services stopped, and data pruned. Run 'make up' or 'make up-no-build' now."
	@echo "****************************************************************************"

.PHONY: all cockroachdb-reset cockroachdb-setup run-api-test run-aggregator-test run-splitter-test run-load-test build-config build up down clean prune prune-oldskool burn
