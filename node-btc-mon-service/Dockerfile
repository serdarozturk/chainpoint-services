FROM chainpoint/node-base

COPY package.json yarn.lock /home/node/app/
RUN yarn

# COPY .env /home/node/app/

COPY server.js /home/node/app/

CMD ["yarn", "start"]
