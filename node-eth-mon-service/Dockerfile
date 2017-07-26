FROM quay.io/chainpoint/node-lib

# needed for  npm package to build
# native extensions
RUN apk add --no-cache make gcc g++ python git && \
  npm install --production --silent && \
  npm install -g node-gyp

COPY package.json yarn.lock /home/node/app/
RUN yarn

ADD . /home/node/app/

# Supporting scripts could not be loaded
RUN chown -R node:node /home/node/app/

CMD ["yarn", "start"]
