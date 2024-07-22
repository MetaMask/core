"use strict";Object.defineProperty(exports, "__esModule", {value: true});


var _chunkQBR7BSWBjs = require('./chunk-QBR7BSWB.js');




var _chunkZ4BLTVTBjs = require('./chunk-Z4BLTVTB.js');

// src/providers/ens.ts
var ID = "ens";
var LABEL = "Ethereum Name Service (ENS)";
var log = _chunkQBR7BSWBjs.createModuleLogger.call(void 0, _chunkQBR7BSWBjs.projectLogger, "ens");
var _isEnabled, _reverseLookup;
var ENSNameProvider = class {
  constructor({
    isEnabled,
    reverseLookup
  }) {
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _isEnabled, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _reverseLookup, void 0);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _isEnabled, isEnabled || (() => true));
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _reverseLookup, reverseLookup);
  }
  getMetadata() {
    return {
      sourceIds: { ["ethereumAddress" /* ETHEREUM_ADDRESS */]: [ID] },
      sourceLabels: { [ID]: LABEL }
    };
  }
  async getProposedNames(request) {
    if (!_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _isEnabled).call(this)) {
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
      const proposedName = await _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _reverseLookup).call(this, value, chainId);
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



exports.ENSNameProvider = ENSNameProvider;
//# sourceMappingURL=chunk-RYIUDJOI.js.map