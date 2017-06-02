# chainpoint-node-calendar-service

## CockroachDB Database Setup

It is necessary to create a 'chainpoint' database for the
chainpoint network blockchain to write concensus data
for the calendar.

First, start only the CockroachDB cluster by itself. Starting
`roach3` will bring up all three nodes (`roach1`, `roach2`, `roach3`)
due to declared dependencies.

```
rm -rf ./data/roach*
docker-compose up -d --build roach3
```

Once CockroachDB is running execute the following commands
to create the expected DB user and database.

Note: You will need to have CockroachDB installed locally
in order to have a copy of the `cockroach` CLI. On
OS X you can get this with `brew install cockroach` using Homebrew.

```
cockroach user set chainpoint --insecure
cockroach sql --insecure -e 'CREATE DATABASE chainpoint'
cockroach sql --insecure -e 'GRANT ALL ON DATABASE chainpoint TO chainpoint'
```

There is also a small shell script to run these for you
that can be found in the file `cockroachdb-setup.sh` in
this directory.

Now that CockroachDB is setup you can start the rest of the cluster:

```
docker-compose up -d --build
```

You can view the `calendar` service logs with `docker-compose logs calendar`
to ensure that blocks are being created.

## Build and Run Locally

Build Container

```
docker build -t chainpoint/node-calendar-service .
```

Run Container Locally

```
docker run -p 49160:8080 -d chainpoint/node-calendar-service
```

Login To Local Container

```
docker ps
docker exec -it <container id> /bin/ash
```
