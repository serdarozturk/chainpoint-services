
/**
 * This class can be used to interact with the BCAP token on the blockchain.
 */
class TokenOps {
  /**
   * Constructor - Takes the ERC 20 token obj already initialized to an instance on the blockchain.
   */
  constructor (tokenContract) {
    this.tokenContract = tokenContract
  }

  /**
   * This function will send tokens to the specified address.
   * The "From" address signing the transaction will be the default account set in the web3 object.
   *
   * @param {*} sendToAddr - Target address
   * @param {*} amt - base units to transfer... If the contract has 18 decimals, 1 token => Math.pow(10, 18) => 1000000000000000000
   * @param {*} callback - Called after the transaction is broadcasted
   */
  sendTokens (sendToAddr, amt, callback) {
    return this.tokenContract.transfer(sendToAddr, amt, callback)
  }

  /**
   * Listener function that will invoke callback whenever a new transaction is found.
   * It will trigger any events from blockstart onwards (pass 0 to see all events in the history of the blockchain.)
   *
   * @param {*} listenAddr - address to listen for incoming transfers
   * @param {*} blockStart - block to start listening from
   * @param {*} callback - callback invoked whenever a new transfer is recieved to listenAddr
   */
  watchForTransfers (listenAddr, blockStart, callback) {
    this.tokenContract.Transfer({'_to': listenAddr}, {'fromBlock': blockStart}, callback)
  }

  /**
   * This function will query the balance of tokens in an address.
   * Note the amt will be specified in base unites.
   *
   * @param {*} address - ETH Address to query
   * @param {*} callback - Called with the amount of tokens
   */
  getBalance (address, callback) {
    return this.tokenContract.balanceOf.call(address, callback)
  }
}
module.exports = TokenOps
