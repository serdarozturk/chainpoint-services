# Ubuntu + Node.js : Illegal Instruction crashes on Alpine 
FROM node:8.1.2

# Build from a specific tag
ENV TESTRPC_RELEASE_TAG=v4.0.0 \
    TESTRPC_REPO=https://github.com/ethereumjs/testrpc.git

RUN mkdir -p /root/testrpc \
    && git clone $TESTRPC_REPO /root/testrpc \
    && cd /root/testrpc \
    && git checkout tags/$TESTRPC_RELEASE_TAG \
    && npm install \
    && npm uninstall node-gyp

EXPOSE 8545

CMD ["node", "/root/testrpc/build/cli.node.js", "-h", "0.0.0.0"]
