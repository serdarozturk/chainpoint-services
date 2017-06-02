#!/bin/bash

# WARNING : This is a dead simple and stupid shell script for quickly nuking
# all data associated with this app and restarting Docker Compose. It also
# takes care of creating the CockroachDB databases we need. There is surely
# a better way.

#################################################################
# WARNING : RUNNING THIS WILL DESTROY ALL LOCAL DATA FOR THIS APP
#################################################################

docker-compose down

sleep 30

rm -rf ./data/*
docker-compose up -d --build roach3

sleep 15

cockroach user set chainpoint --insecure
cockroach sql --insecure -e 'CREATE DATABASE chainpoint'
cockroach sql --insecure -e 'GRANT ALL ON DATABASE chainpoint TO chainpoint'

sleep 5

docker-compose up -d --build
