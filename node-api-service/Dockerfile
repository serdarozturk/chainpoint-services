FROM quay.io/chainpoint/node-lib

# Define and install dependencies
COPY package.json yarn.lock /home/node/app/
RUN yarn

RUN mkdir /home/node/app/lib/endpoints
COPY ./lib/endpoints/*.js /home/node/app/lib/endpoints/

COPY ./lib/models/*.js /home/node/app/lib/models/

COPY ./lib/*.json /home/node/app/lib/

COPY server.js /home/node/app/

EXPOSE 8080

CMD ["yarn", "start"]
