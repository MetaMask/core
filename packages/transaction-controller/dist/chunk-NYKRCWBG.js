"use strict";Object.defineProperty(exports, "__esModule", {value: true});

var _chunkYVCX6Z75js = require('./chunk-YVCX6Z75.js');


var _chunkUGN7PBONjs = require('./chunk-UGN7PBON.js');

// src/gas-flows/OptimismLayer1GasFeeFlow.ts
var OPTIMISM_STACK_CHAIN_IDS = [
  _chunkUGN7PBONjs.CHAIN_IDS.OPTIMISM,
  _chunkUGN7PBONjs.CHAIN_IDS.OPTIMISM_TESTNET,
  _chunkUGN7PBONjs.CHAIN_IDS.BASE,
  _chunkUGN7PBONjs.CHAIN_IDS.BASE_TESTNET,
  _chunkUGN7PBONjs.CHAIN_IDS.OPBNB,
  _chunkUGN7PBONjs.CHAIN_IDS.OPBNB_TESTNET,
  _chunkUGN7PBONjs.CHAIN_IDS.ZORA
];
var OPTIMISM_GAS_PRICE_ORACLE_ADDRESS = "0x420000000000000000000000000000000000000F";
var OptimismLayer1GasFeeFlow = class extends _chunkYVCX6Z75js.OracleLayer1GasFeeFlow {
  constructor() {
    super(OPTIMISM_GAS_PRICE_ORACLE_ADDRESS);
  }
  matchesTransaction(transactionMeta) {
    return OPTIMISM_STACK_CHAIN_IDS.includes(transactionMeta.chainId);
  }
};



exports.OptimismLayer1GasFeeFlow = OptimismLayer1GasFeeFlow;
//# sourceMappingURL=chunk-NYKRCWBG.js.map