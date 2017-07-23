/* global artifacts, contract, it, assert */
var BCAPTestToken = artifacts.require('./BCAPTestToken.sol')

contract('BCAPTestToken', (accounts) => {
  it('should deploy', () => {
    return BCAPTestToken.deployed()
    .then((instance) => {
      assert.notEqual(instance, null, 'Instance should not be null')
    })
  })
})
