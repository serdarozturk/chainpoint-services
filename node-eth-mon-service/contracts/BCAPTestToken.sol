pragma solidity ^0.4.11;

import "./BCAPToken.sol";

contract BCAPTestToken is BCAPToken {

  // Public variables
  string constant public name = "The-Test-Token"; 
  string constant public symbol = "TTT";
  uint constant public decimals = 18;

  // Constructor
  function BCAPTestToken (address _tokenIssuer)
    BCAPToken (_tokenIssuer) {
  }
}