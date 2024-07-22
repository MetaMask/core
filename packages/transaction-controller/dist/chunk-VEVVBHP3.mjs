import {
  OracleLayer1GasFeeFlow
} from "./chunk-FG74Z3F5.mjs";
import {
  CHAIN_IDS
} from "./chunk-O6ZZVIFH.mjs";

// src/gas-flows/OptimismLayer1GasFeeFlow.ts
var OPTIMISM_STACK_CHAIN_IDS = [
  CHAIN_IDS.OPTIMISM,
  CHAIN_IDS.OPTIMISM_TESTNET,
  CHAIN_IDS.BASE,
  CHAIN_IDS.BASE_TESTNET,
  CHAIN_IDS.OPBNB,
  CHAIN_IDS.OPBNB_TESTNET,
  CHAIN_IDS.ZORA
];
var OPTIMISM_GAS_PRICE_ORACLE_ADDRESS = "0x420000000000000000000000000000000000000F";
var OptimismLayer1GasFeeFlow = class extends OracleLayer1GasFeeFlow {
  constructor() {
    super(OPTIMISM_GAS_PRICE_ORACLE_ADDRESS);
  }
  matchesTransaction(transactionMeta) {
    return OPTIMISM_STACK_CHAIN_IDS.includes(transactionMeta.chainId);
  }
};

export {
  OptimismLayer1GasFeeFlow
};
//# sourceMappingURL=chunk-VEVVBHP3.mjs.map