FROM quay.io/chainpoint/node-lib

COPY package.json yarn.lock /home/node/app/
RUN yarn

ADD . /home/node/app/

CMD ["yarn", "start"]
