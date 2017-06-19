FROM quay.io/chainpoint/node-base

COPY package.json yarn.lock /home/node/app/
RUN yarn

COPY server.js /home/node/app/

EXPOSE 8080

CMD ["yarn", "start"]
