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

let genTx = (merkleRoot, spendable_ouputs, master, change_path, txfee ) =>{

var keyring = bcoin.keyring()
var coins = [];

for (var output in spendable_ouputs) {
  keyring.add(master.derive(output.path))
  var coin = bcoin.coin.fromTX(output.tx, output.idx, output.height);
  coins.push(coin);
}

var mtx = new bcoin.mtx();


mtx.addOutput(bcoin.Script.fromNullData(merkle_root),null);

return mtx.fund(coins, {
  rate:TXFEE,
  changeAddress: master.derive(change_path).toAddress()
  }).then(
    ()=>{
      mtx.sign(keyring);
      assert(mtx.verify());
      var tx = mtx.toTX();
      return tx
    }
  )
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
genTx(merkleRoot,spendable,master,changepath,TXFEE ).then((tx)=>{
    return broadcastTx(tx); //TODO
  }).then(()=>{
    return pushTxIntoFullNodeMonitoring(tx); //TODO
  })




}

setInterval(() => finalize(), 1000)

//Export for unit tests
module.exports={
  genTx:genTx
}