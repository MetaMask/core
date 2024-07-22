import {
  OracleLayer1GasFeeFlow
} from "./chunk-FG74Z3F5.mjs";
import {
  CHAIN_IDS
} from "./chunk-O6ZZVIFH.mjs";

// src/gas-flows/ScrollLayer1GasFeeFlow.ts
var SCROLL_CHAIN_IDS = [CHAIN_IDS.SCROLL, CHAIN_IDS.SCROLL_SEPOLIA];
var SCROLL_GAS_PRICE_ORACLE_ADDRESS = "0x5300000000000000000000000000000000000002";
var ScrollLayer1GasFeeFlow = class extends OracleLayer1GasFeeFlow {
  constructor() {
    super(SCROLL_GAS_PRICE_ORACLE_ADDRESS, true);
  }
  matchesTransaction(transactionMeta) {
    return SCROLL_CHAIN_IDS.includes(transactionMeta.chainId);
  }
};

export {
  ScrollLayer1GasFeeFlow
};
//# sourceMappingURL=chunk-Z4GV3YQQ.mjs.map