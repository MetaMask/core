"use strict";Object.defineProperty(exports, "__esModule", {value: true});// src/utils.ts
var _util = require('@ethereumjs/util');
var _keyringcontroller = require('@metamask/keyring-controller');
var _sha256 = require('ethereum-cryptography/sha256');
var _uuid = require('uuid');
function keyringTypeToName(keyringType) {
  if (_keyringcontroller.isCustodyKeyring.call(void 0, keyringType)) {
    return "Custody";
  }
  switch (keyringType) {
    case _keyringcontroller.KeyringTypes.simple: {
      return "Account";
    }
    case _keyringcontroller.KeyringTypes.hd: {
      return "Account";
    }
    case _keyringcontroller.KeyringTypes.trezor: {
      return "Trezor";
    }
    case _keyringcontroller.KeyringTypes.ledger: {
      return "Ledger";
    }
    case _keyringcontroller.KeyringTypes.lattice: {
      return "Lattice";
    }
    case _keyringcontroller.KeyringTypes.qr: {
      return "QR";
    }
    case _keyringcontroller.KeyringTypes.snap: {
      return "Snap Account";
    }
    default: {
      throw new Error(`Unknown keyring ${keyringType}`);
    }
  }
}
function getUUIDOptionsFromAddressOfNormalAccount(address) {
  const v4options = {
    random: _sha256.sha256.call(void 0, _util.toBuffer.call(void 0, address)).slice(0, 16)
  };
  return v4options;
}
function getUUIDFromAddressOfNormalAccount(address) {
  return _uuid.v4.call(void 0, getUUIDOptionsFromAddressOfNormalAccount(address));
}
function isNormalKeyringType(keyringType) {
  return keyringType !== _keyringcontroller.KeyringTypes.snap;
}






exports.keyringTypeToName = keyringTypeToName; exports.getUUIDOptionsFromAddressOfNormalAccount = getUUIDOptionsFromAddressOfNormalAccount; exports.getUUIDFromAddressOfNormalAccount = getUUIDFromAddressOfNormalAccount; exports.isNormalKeyringType = isNormalKeyringType;
//# sourceMappingURL=chunk-BYPP7G2N.js.map