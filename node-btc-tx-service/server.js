const async = require('async')
const _ = require('lodash')
const bcoin = require('bcoin')
require('dotenv').config()

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
