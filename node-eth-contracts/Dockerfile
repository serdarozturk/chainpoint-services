FROM quay.io/chainpoint/node-lib

# needed for  npm package to build
# native extensions
RUN apk add --no-cache git

COPY package.json yarn.lock /home/node/app/
RUN yarn

ADD . /home/node/app/

WORKDIR /home/node/app/

# Supporting scripts could not be loaded
RUN chown -R node:node /home/node/app/build
RUN chown -R node:node /home/node/app/contracts
RUN chown -R node:node /home/node/app/migrations

CMD ["npm", "run", "migrate"]
