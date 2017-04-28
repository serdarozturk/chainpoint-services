const async = require('async')
const _ = require('lodash')
const bcoin = require('bcoin')
require('dotenv').config()


var Peer = bcoin.net.Peer;
var NetAddress = bcoin.primitives.NetAddress;
var Network = bcoin.protocol.Network;


let broadcastTx = (tx) => {


  var network = Network.get('testnet');

  var peer, addr;

  peer = Peer.fromOptions({
    network: 'testnet',
    agent: 'my-subversion',
    hasWitness: function () {
      return false;
    }
  });

  addr = NetAddress.fromHostname(process.env.BROADCAST_PEER, 'testnet');


  return new Promise((resolve, reject) => {

    peer.connect(addr);
    peer.tryOpen();

    peer.on('error', function (err) {
      reject(err);
    });


    peer.on('open', function () {
      peer.announceTX([tx]);
      resolve(tx);
    });
  })
}

// just a temp function
let finalize = () => {

  console.log('BTC TX...')

//Fetch this from Rabbit MQ?
const merkle_root = Buffer();


const master = bcoin.hd.fromSeed(process.env.SEED);

const TXFEE = parseInt(process.evn.TXFEE);
const TXAMOUNT = parseInt(process.evn.TXFEE);

//TODO get UTXO from somewhere
//UTXO should store a tx, spendable indexes, path value, a key id, and a blockheight

let utxos = []

var keyring = bcoin.keyring()
var coins = [];

//Store a path with each transactions so we can derive the appropiate private key
for (var utxo in utxos) {
  keyring.add(master.derive(utxo.path))
  var coin = bcoin.coin.fromTX(utxo.tx, utxo.idx, utxo.height);
  coins.push(coin);
}

var mtx = new bcoin.mtx();

//TODO Get the next path from somewhere
const change_path = "increment path somehow"

mtx.addOutput(bcoin.Script.fromNullData(merkle_root),null);

mtx.fund(coins, {
  rate:TXFEE,
  changeAddress: master.derive(change_path)
  }).then(
    ()=>{
      mtx.sign(keyring);
      assert(mtx.verify());
      var tx = mtx.toTX();
      return tx
    }
  ).then((tx)=>{
    return broadcastTx(tx); //TODO
  }).then(()=>{
    return pushTxIntoFullNodeMonitoring(tx); //TODO
  })




}

setInterval(() => finalize(), 1000)
