#!/bin/bash
cockroach user set chainpoint --insecure
cockroach sql --insecure -e 'CREATE DATABASE chainpoint'
cockroach sql --insecure -e 'GRANT ALL ON DATABASE chainpoint TO chainpoint'
