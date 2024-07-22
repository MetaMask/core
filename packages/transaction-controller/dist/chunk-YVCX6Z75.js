"use strict";Object.defineProperty(exports, "__esModule", {value: true});

var _chunkS6VGOPUYjs = require('./chunk-S6VGOPUY.js');





var _chunkZ4BLTVTBjs = require('./chunk-Z4BLTVTB.js');

// src/gas-flows/OracleLayer1GasFeeFlow.ts
var _common = require('@ethereumjs/common');
var _tx = require('@ethereumjs/tx');
var _contracts = require('@ethersproject/contracts');
var _providers = require('@ethersproject/providers');
var _utils = require('@metamask/utils');
var _lodash = require('lodash');
var log = _utils.createModuleLogger.call(void 0, _chunkS6VGOPUYjs.projectLogger, "oracle-layer1-gas-fee-flow");
var DUMMY_KEY = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
var GAS_PRICE_ORACLE_ABI = [
  {
    inputs: [{ internalType: "bytes", name: "_data", type: "bytes" }],
    name: "getL1Fee",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
];
var _oracleAddress, _signTransaction, _getOracleLayer1GasFee, getOracleLayer1GasFee_fn, _buildUnserializedTransaction, buildUnserializedTransaction_fn, _buildTransactionParams, buildTransactionParams_fn, _buildTransactionCommon, buildTransactionCommon_fn;
var OracleLayer1GasFeeFlow = class {
  constructor(oracleAddress, signTransaction) {
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getOracleLayer1GasFee);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _buildUnserializedTransaction);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _buildTransactionParams);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _buildTransactionCommon);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _oracleAddress, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _signTransaction, void 0);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _oracleAddress, oracleAddress);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _signTransaction, signTransaction ?? false);
  }
  async getLayer1Fee(request) {
    try {
      return await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getOracleLayer1GasFee, getOracleLayer1GasFee_fn).call(this, request);
    } catch (error) {
      log("Failed to get oracle layer 1 gas fee", error);
      throw new Error(`Failed to get oracle layer 1 gas fee`);
    }
  }
};
_oracleAddress = new WeakMap();
_signTransaction = new WeakMap();
_getOracleLayer1GasFee = new WeakSet();
getOracleLayer1GasFee_fn = async function(request) {
  const { provider, transactionMeta } = request;
  const contract = new (0, _contracts.Contract)(
    _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _oracleAddress),
    GAS_PRICE_ORACLE_ABI,
    // Network controller provider type is incompatible with ethers provider
    new (0, _providers.Web3Provider)(provider)
  );
  const serializedTransaction = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _buildUnserializedTransaction, buildUnserializedTransaction_fn).call(this, transactionMeta, _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _signTransaction)).serialize();
  const result = await contract.getL1Fee(serializedTransaction);
  if (result === void 0) {
    throw new Error("No value returned from oracle contract");
  }
  return {
    layer1Fee: result.toHexString()
  };
};
_buildUnserializedTransaction = new WeakSet();
buildUnserializedTransaction_fn = function(transactionMeta, sign) {
  const txParams = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _buildTransactionParams, buildTransactionParams_fn).call(this, transactionMeta);
  const common = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _buildTransactionCommon, buildTransactionCommon_fn).call(this, transactionMeta);
  let unserializedTransaction = _tx.TransactionFactory.fromTxData(txParams, {
    common
  });
  if (sign) {
    const keyBuffer = Buffer.from(DUMMY_KEY, "hex");
    unserializedTransaction = unserializedTransaction.sign(keyBuffer);
  }
  return unserializedTransaction;
};
_buildTransactionParams = new WeakSet();
buildTransactionParams_fn = function(transactionMeta) {
  return {
    ..._lodash.omit.call(void 0, transactionMeta.txParams, "gas"),
    gasLimit: transactionMeta.txParams.gas
  };
};
_buildTransactionCommon = new WeakSet();
buildTransactionCommon_fn = function(transactionMeta) {
  const chainId = Number(transactionMeta.chainId);
  return _common.Common.custom({
    chainId,
    defaultHardfork: _common.Hardfork.London
  });
};



exports.OracleLayer1GasFeeFlow = OracleLayer1GasFeeFlow;
//# sourceMappingURL=chunk-YVCX6Z75.js.map