/* global artifacts */
var BCAPTestToken = artifacts.require('./BCAPTestToken.sol')

// This deploys the BCAP token using the default account as the owner.
module.exports = function (deployer, network, accounts) {
  deployer.deploy(BCAPTestToken, accounts[0])
}
