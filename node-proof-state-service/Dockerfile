FROM chainpoint/node-lib

# Define and install dependencies
COPY package.json yarn.lock /home/node/app/
RUN yarn

RUN mkdir /home/node/app/storage-adapters
COPY ./storage-adapters/*.js /home/node/app/storage-adapters/

COPY server.js /home/node/app/

CMD ["yarn", "start"]
