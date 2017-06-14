FROM quay.io/chainpoint/node-lib

COPY package.json yarn.lock /home/node/app/
RUN yarn

COPY parse-env.js /home/node/app/
COPY server.js /home/node/app/

CMD ["yarn", "start"]
