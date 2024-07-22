"use strict";Object.defineProperty(exports, "__esModule", {value: true});

var _chunkOIJGGQRQjs = require('./chunk-OIJGGQRQ.js');




var _chunkBTR56Y3Fjs = require('./chunk-BTR56Y3F.js');




var _chunkZ4BLTVTBjs = require('./chunk-Z4BLTVTB.js');

// src/helpers/SnapSmartContractAccount.ts
var _messenger;
var SnapSmartContractAccount = class {
  constructor(messenger) {
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _messenger, void 0);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _messenger, messenger);
  }
  async prepareUserOperation(request) {
    const {
      chainId,
      data: requestData,
      from: sender,
      to: requestTo,
      value: requestValue
    } = request;
    const data = requestData ?? _chunkBTR56Y3Fjs.EMPTY_BYTES;
    const to = requestTo ?? _chunkBTR56Y3Fjs.ADDRESS_ZERO;
    const value = requestValue ?? _chunkBTR56Y3Fjs.VALUE_ZERO;
    const response = await _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _messenger).call(
      "KeyringController:prepareUserOperation",
      sender,
      [{ data, to, value }],
      { chainId: _chunkOIJGGQRQjs.toEip155ChainId.call(void 0, chainId) }
    );
    const {
      bundlerUrl: bundler,
      callData,
      dummyPaymasterAndData,
      dummySignature,
      gasLimits: gas,
      initCode,
      nonce
    } = response;
    return {
      bundler,
      callData,
      dummyPaymasterAndData,
      dummySignature,
      gas,
      initCode,
      nonce,
      sender
    };
  }
  async updateUserOperation(request) {
    const { userOperation, chainId } = request;
    const { sender } = userOperation;
    const {
      paymasterAndData: responsePaymasterAndData,
      verificationGasLimit,
      preVerificationGas,
      callGasLimit
    } = await _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _messenger).call(
      "KeyringController:patchUserOperation",
      sender,
      userOperation,
      { chainId: _chunkOIJGGQRQjs.toEip155ChainId.call(void 0, chainId) }
    );
    const paymasterAndData = responsePaymasterAndData === _chunkBTR56Y3Fjs.EMPTY_BYTES ? void 0 : responsePaymasterAndData;
    return {
      paymasterAndData,
      verificationGasLimit,
      preVerificationGas,
      callGasLimit
    };
  }
  async signUserOperation(request) {
    const { userOperation, chainId } = request;
    const { sender } = userOperation;
    const signature = await _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _messenger).call(
      "KeyringController:signUserOperation",
      sender,
      userOperation,
      { chainId: _chunkOIJGGQRQjs.toEip155ChainId.call(void 0, chainId) }
    );
    return { signature };
  }
};
_messenger = new WeakMap();



exports.SnapSmartContractAccount = SnapSmartContractAccount;
//# sourceMappingURL=chunk-MRVTCZLI.js.map