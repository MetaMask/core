"use strict";Object.defineProperty(exports, "__esModule", {value: true});

var _chunkYVCX6Z75js = require('./chunk-YVCX6Z75.js');


var _chunkUGN7PBONjs = require('./chunk-UGN7PBON.js');

// src/gas-flows/ScrollLayer1GasFeeFlow.ts
var SCROLL_CHAIN_IDS = [_chunkUGN7PBONjs.CHAIN_IDS.SCROLL, _chunkUGN7PBONjs.CHAIN_IDS.SCROLL_SEPOLIA];
var SCROLL_GAS_PRICE_ORACLE_ADDRESS = "0x5300000000000000000000000000000000000002";
var ScrollLayer1GasFeeFlow = class extends _chunkYVCX6Z75js.OracleLayer1GasFeeFlow {
  constructor() {
    super(SCROLL_GAS_PRICE_ORACLE_ADDRESS, true);
  }
  matchesTransaction(transactionMeta) {
    return SCROLL_CHAIN_IDS.includes(transactionMeta.chainId);
  }
};



exports.ScrollLayer1GasFeeFlow = ScrollLayer1GasFeeFlow;
//# sourceMappingURL=chunk-WR5F34OW.js.map