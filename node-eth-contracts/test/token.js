/* global artifacts, contract, it, assert */
var TierionNetworkToken = artifacts.require('./TierionNetworkToken.sol')

contract('TierionNetworkToken', (accounts) => {
  it('should deploy', () => {
    return TierionNetworkToken.deployed()
    .then((instance) => {
      assert.notEqual(instance, null, 'Instance should not be null')
    })
  })
})
