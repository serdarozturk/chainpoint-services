const async = require('async')
const _ = require('lodash')
const bcoin = require('bcoin')
require('dotenv').config()

// FIXME : point the default at production host later
const BROADCAST_PEER_HOST = process.env.BROADCAST_PEER || 'bcoin.staging.chainpoint.org:18333'
// FIXME : point the network type to 'main' later
const BROADCAST_PEER_NET_TYPE = process.env.BROADCAST_PEER_NET_TYPE || 'testnet'

const REDIS_CONNECT_URI = process.env.REDIS_CONNECT_URI || 'redis://redis:6379'

var Peer = bcoin.net.Peer
var NetAddress = bcoin.primitives.NetAddress
var Network = bcoin.protocol.Network

let broadcastTx = (tx) => {
  var peer, addr

  peer = Peer.fromOptions({
    network: BROADCAST_PEER_NET_TYPE,
    agent: 'my-subversion',
    hasWitness: function () {
      return false
    }
  })

  addr = NetAddress.fromHostname(BROADCAST_PEER_HOST, BROADCAST_PEER_NET_TYPE)

  return new Promise((resolve, reject) => {
    peer.connect(addr)
    peer.tryOpen()

    peer.on('error', function (err) {
      reject(err)
    })

    peer.on('open', function () {
      peer.announceTX([tx])
      resolve(tx)
    })
  })
}

let genTx = (merkleRoot, spendable_ouputs, master, change_path, txfee) => {
  var keyring = bcoin.keyring()
  var coins = []

  for (var output in spendable_ouputs) {
    keyring.add(master.derive(output.path))
    var coin = bcoin.coin.fromTX(output.tx, output.idx, output.height)
    coins.push(coin)
  }

  var mtx = new bcoin.mtx()

  mtx.addOutput(bcoin.Script.fromNullData(merkle_root), null)

  return mtx.fund(coins, {
    rate: TXFEE,
    changeAddress: master.derive(change_path).toAddress()
  }).then(
    () => {
      mtx.sign(keyring)
      assert(mtx.verify())
      var tx = mtx.toTX()
      return tx
    }
  )
}

let sendTxToBTC = () => {
  console.log('BTC TX...')

  // FIXME : This will be injected into this service from RMQ. Hardcoded for initial test
  const merkleRoot = Buffer.from('1c8a5401bcfa516bc481728692b7498f4d379c9404a2b3ff98cd78de01ad6f0f')

  const master = bcoin.hd.fromSeed(process.env.SEED)

  const TXFEE = parseInt(process.evn.TXFEE)
  const TXAMOUNT = parseInt(process.evn.TXFEE)

  // TODO get UTXO from somewhere
  // UTXO should store a tx, spendable indexes, path value, a key id, and a blockheight
  genTx(merkleRoot, spendable, master, changepath, TXFEE).then((tx) => {
    return broadcastTx(tx) // TODO
  }).then(() => {
    return pushTxIntoFullNodeMonitoring(tx) // TODO
  })
}

setInterval(() => sendTxToBTC(), 1000 * 60 * 10) // 10 min

// Export for unit tests
module.exports = {
  genTx: genTx
}
