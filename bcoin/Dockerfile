# Ubuntu + Node.js : Illegal Instruction crashes on Alpine 
FROM node:7.10.0

# Build from a specific commit, not tip of master branch
ENV BCOIN_BRANCH=master \
    BCOIN_REPO=https://github.com/bcoin-org/bcoin.git \
    BCOIN_SHA1=f0b43764b1d71737ec38d6f0147a76bba270bfb5

RUN mkdir -p /root/bcoin /root/.bcoin \
    && git clone --branch $BCOIN_BRANCH $BCOIN_REPO /root/bcoin \
    && cd /root/bcoin \
    && git reset --hard $BCOIN_SHA1 \
    && npm install --production \
    && npm uninstall node-gyp

COPY bcoin.testnet.conf /root/.bcoin/bcoin.conf

CMD ["/root/bcoin/bin/bcoin", "--index-tx", "--index-address"]
