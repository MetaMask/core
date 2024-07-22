"use strict";Object.defineProperty(exports, "__esModule", {value: true});require('../chunk-UJIPPGP6.js');

// src/tests/mocks.ts





var _keyringapi = require('@metamask/keyring-api');
var _keyringcontroller = require('@metamask/keyring-controller');
var _uuid = require('uuid');
var createMockInternalAccount = ({
  id = _uuid.v4.call(void 0, ),
  address = "0x2990079bcdee240329a520d2444386fc119da21a",
  type = _keyringapi.EthAccountType.Eoa,
  name = "Account 1",
  keyringType = _keyringcontroller.KeyringTypes.hd,
  snap,
  importTime = Date.now(),
  lastSelected = Date.now()
} = {}) => {
  let methods;
  switch (type) {
    case _keyringapi.EthAccountType.Eoa:
      methods = [
        _keyringapi.EthMethod.PersonalSign,
        _keyringapi.EthMethod.Sign,
        _keyringapi.EthMethod.SignTransaction,
        _keyringapi.EthMethod.SignTypedDataV1,
        _keyringapi.EthMethod.SignTypedDataV3,
        _keyringapi.EthMethod.SignTypedDataV4
      ];
      break;
    case _keyringapi.EthAccountType.Erc4337:
      methods = [
        _keyringapi.EthMethod.PatchUserOperation,
        _keyringapi.EthMethod.PrepareUserOperation,
        _keyringapi.EthMethod.SignUserOperation
      ];
      break;
    case _keyringapi.BtcAccountType.P2wpkh:
      methods = [_keyringapi.BtcMethod.SendMany];
      break;
    default:
      throw new Error(`Unknown account type: ${type}`);
  }
  return {
    id,
    address,
    options: {},
    methods,
    type,
    metadata: {
      name,
      keyring: { type: keyringType },
      importTime,
      lastSelected,
      snap
    }
  };
};


exports.createMockInternalAccount = createMockInternalAccount;
//# sourceMappingURL=mocks.js.map