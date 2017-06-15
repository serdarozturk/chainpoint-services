FROM quay.io/chainpoint/node-lib

# Define and install dependencies
COPY package.json yarn.lock /home/node/app/
RUN yarn

COPY parse-env.js /home/node/app/
COPY server.js /home/node/app/

EXPOSE 8080

CMD ["yarn", "start"]
