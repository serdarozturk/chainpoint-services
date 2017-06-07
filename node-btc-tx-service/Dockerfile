FROM chainpoint/node-base

# needed for bcoin npm package to build
# native extensions
RUN apk add --no-cache make gcc g++ python && \
  npm install --production --silent && \
  npm install -g node-gyp

COPY package.json yarn.lock /home/node/app/
RUN yarn

# COPY .env /home/node/app/

COPY server.js /home/node/app/

CMD ["yarn", "start"]
