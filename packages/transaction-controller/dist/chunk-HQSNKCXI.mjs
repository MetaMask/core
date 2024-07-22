// src/errors.ts
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

export {
  SimulationError,
  SimulationChainNotSupportedError,
  SimulationInvalidResponseError,
  SimulationRevertedError
};
//# sourceMappingURL=chunk-HQSNKCXI.mjs.map