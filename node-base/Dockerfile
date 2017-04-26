# chainpoint/node-base
#
# A base container that all chainpoint node based
# services will inherit from.

# Node.js on Alpine Linux
# see: https://github.com/nodejs/LTS
# see: https://hub.docker.com/_/node/
# see: https://alpinelinux.org/
FROM node:7.9.0-alpine

LABEL MAINTAINER="Glenn Rempe <glenn@tierion.com>"

# tini
#   A tiny but valid `init` for containers
#   see: https://github.com/krallin/tini
#
# su-exec
#   A tool to switch user and group id and exec
#   see: https://github.com/ncopa/su-exec
#
RUN apk add --update tini su-exec

# The `node` user and its home dir is provided by
# the base image. Create a subdir where the app code
# will live.
RUN mkdir /home/node/app

# Commands that follow, in this or inheriting containers,
# will be run in the context of this directory.
WORKDIR /home/node/app

# All CMD's in containers that inherit from this base
# will be prefixed with the following command wrapper
# defined in this ENTRYPOINT. They'll be wrapped to:
#
#   - use su-exec to run the command as a non-root user
#   - which will be run by `tini` which solves the PID 1 problem
#
# For more on the PID 1 problem see:
#   https://blog.phusion.nl/2015/01/20/docker-and-the-pid-1-zombie-reaping-problem/
#   https://engineeringblog.yelp.com/2016/01/dumb-init-an-init-for-docker.html
#
ENTRYPOINT ["su-exec", "node:node", "/sbin/tini", "--"]
