const ethjsUtil = require('ethjs-util')

module.exports = {
  incrementHexNumber,
}

function incrementHexNumber(hexNum) {
  return ethjsUtil.intToHex((parseInt(hexNum, 16) + 1))
}