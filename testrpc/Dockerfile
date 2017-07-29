# Ubuntu + Node.js
FROM node:8.1.2

# Create the db dir
RUN mkdir -p /root/testrpc/db

# Install testprc
RUN npm install -g ethereumjs-testrpc

EXPOSE 8545

CMD ["testrpc"]
