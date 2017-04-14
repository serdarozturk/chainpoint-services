FROM chainpoint/node-base

# Define and install dependencies
COPY package.json yarn.lock /home/node/app/
RUN yarn

RUN mkdir /home/node/app/storage-adapters
COPY ./storage-adapters/*.js /home/node/app/storage-adapters/

COPY server.js /home/node/app/

EXPOSE 8080

CMD ["yarn", "start"]
