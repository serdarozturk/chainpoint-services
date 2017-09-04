FROM quay.io/chainpoint/node-lib

RUN apk add --no-cache git make gcc g++ python

COPY package.json yarn.lock /home/node/app/
RUN yarn

ADD . /home/node/app/

WORKDIR /home/node/app/

# Supporting scripts could not be loaded
RUN chown -R node:node /home/node/app/

CMD ["npm", "run", "start"]
