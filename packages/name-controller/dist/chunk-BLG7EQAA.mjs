import {
  createModuleLogger,
  projectLogger
} from "./chunk-L244TFFU.mjs";
import {
  __privateAdd,
  __privateGet,
  __privateSet
} from "./chunk-XUI43LEZ.mjs";

// src/providers/ens.ts
var ID = "ens";
var LABEL = "Ethereum Name Service (ENS)";
var log = createModuleLogger(projectLogger, "ens");
var _isEnabled, _reverseLookup;
var ENSNameProvider = class {
  constructor({
    isEnabled,
    reverseLookup
  }) {
    __privateAdd(this, _isEnabled, void 0);
    __privateAdd(this, _reverseLookup, void 0);
    __privateSet(this, _isEnabled, isEnabled || (() => true));
    __privateSet(this, _reverseLookup, reverseLookup);
  }
  getMetadata() {
    return {
      sourceIds: { ["ethereumAddress" /* ETHEREUM_ADDRESS */]: [ID] },
      sourceLabels: { [ID]: LABEL }
    };
  }
  async getProposedNames(request) {
    if (!__privateGet(this, _isEnabled).call(this)) {
      log("Skipping request as disabled");
      return {
        results: {
          [ID]: {
            proposedNames: []
          }
        }
      };
    }
    const { value, variation: chainId } = request;
    log("Invoking callback", { value, chainId });
    try {
      const proposedName = await __privateGet(this, _reverseLookup).call(this, value, chainId);
      const proposedNames = proposedName ? [proposedName] : [];
      log("New proposed names", proposedNames);
      return {
        results: {
          [ID]: { proposedNames }
        }
      };
    } catch (error) {
      log("Request failed", error);
      throw error;
    }
  }
};
_isEnabled = new WeakMap();
_reverseLookup = new WeakMap();

export {
  ENSNameProvider
};
//# sourceMappingURL=chunk-BLG7EQAA.mjs.map