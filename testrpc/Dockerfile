FROM quay.io/chainpoint/node-base

# Create the db dir
RUN mkdir -p /root/testrpc/db

# Install testprc
RUN npm install -g ethereumjs-testrpc

EXPOSE 8545

CMD ["testrpc"]
