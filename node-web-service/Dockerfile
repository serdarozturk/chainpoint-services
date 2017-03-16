# Node.js current LTS version 6.10
# see: https://github.com/nodejs/LTS
# see: https://hub.docker.com/_/node/
FROM node:boron-alpine

MAINTAINER Glenn Rempe

# RUN npm cache clean
# fix for: .roadrunner.json error https://github.com/yarnpkg/yarn/issues/1724
# RUN mkdir -p /root/.cache/yarn/
# RUN yarn --version

# Create app directory
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

# Install app dependencies
COPY package.json /usr/src/app/
RUN yarn install

# Bundle app source
COPY . /usr/src/app

EXPOSE 8080
CMD [ "yarn", "start" ]
