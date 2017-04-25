'use strict';

var ethjsUtil = require('ethjs-util');

module.exports = {
  incrementHexNumber: incrementHexNumber
};

function incrementHexNumber(hexNum) {
  return ethjsUtil.intToHex(parseInt(hexNum, 16) + 1);
}