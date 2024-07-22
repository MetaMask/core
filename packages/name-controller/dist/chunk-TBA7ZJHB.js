"use strict";Object.defineProperty(exports, "__esModule", {value: true});

var _chunkMBPHCUIOjs = require('./chunk-MBPHCUIO.js');



var _chunkQBR7BSWBjs = require('./chunk-QBR7BSWB.js');




var _chunkZ4BLTVTBjs = require('./chunk-Z4BLTVTB.js');

// src/providers/token.ts
var ID = "token";
var LABEL = "Blockchain (Token Name)";
var log = _chunkQBR7BSWBjs.createModuleLogger.call(void 0, _chunkQBR7BSWBjs.projectLogger, "token");
var _isEnabled;
var TokenNameProvider = class {
  constructor({ isEnabled } = {}) {
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _isEnabled, void 0);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _isEnabled, isEnabled || (() => true));
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
    const url = `https://token.api.cx.metamask.io/token/${chainId}?address=${value}`;
    log("Sending request", url);
    try {
      const responseData = await _chunkMBPHCUIOjs.handleFetch.call(void 0, url);
      const proposedName = responseData.name;
      const proposedNames = proposedName ? [proposedName] : [];
      log("New proposed names", proposedNames);
      return {
        results: {
          [ID]: {
            proposedNames
          }
        }
      };
    } catch (error) {
      log("Request failed", error);
      throw error;
    }
  }
};
_isEnabled = new WeakMap();



exports.TokenNameProvider = TokenNameProvider;
//# sourceMappingURL=chunk-TBA7ZJHB.js.map