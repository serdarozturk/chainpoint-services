/* global artifacts, contract, it, assert */
var TheTestToken = artifacts.require('./TheTestToken.sol')

contract('TheTestToken', (accounts) => {
  it('should deploy', () => {
    return TheTestToken.deployed()
    .then((instance) => {
      assert.notEqual(instance, null, 'Instance should not be null')
    })
  })
})
