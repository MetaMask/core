"use strict";Object.defineProperty(exports, "__esModule", {value: true});// src/errors.ts
var SimulationError = class extends Error {
  constructor(message, code) {
    super(message ?? "Simulation failed");
    this.code = code;
  }
};
var SimulationChainNotSupportedError = class extends SimulationError {
  constructor(chainId) {
    super(
      `Chain is not supported: ${chainId}`,
      "chain-not-supported" /* ChainNotSupported */
    );
  }
};
var SimulationInvalidResponseError = class extends SimulationError {
  constructor() {
    super(
      "Invalid response from simulation API",
      "invalid-response" /* InvalidResponse */
    );
  }
};
var SimulationRevertedError = class extends SimulationError {
  constructor() {
    super("Transaction was reverted", "reverted" /* Reverted */);
  }
};






exports.SimulationError = SimulationError; exports.SimulationChainNotSupportedError = SimulationChainNotSupportedError; exports.SimulationInvalidResponseError = SimulationInvalidResponseError; exports.SimulationRevertedError = SimulationRevertedError;
//# sourceMappingURL=chunk-HMOSP33F.js.map