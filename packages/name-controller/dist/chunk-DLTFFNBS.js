"use strict";Object.defineProperty(exports, "__esModule", {value: true});

var _chunkMBPHCUIOjs = require('./chunk-MBPHCUIO.js');



var _chunkQBR7BSWBjs = require('./chunk-QBR7BSWB.js');




var _chunkZ4BLTVTBjs = require('./chunk-Z4BLTVTB.js');

// src/providers/lens.ts
var ID = "lens";
var LABEL = "Lens Protocol";
var LENS_URL = `https://api.lens.dev`;
var QUERY = `
query HandlesForAddress($address: EthereumAddress!) {
  profiles(request: { ownedBy: [$address] }) {
    items {
      handle
    }
  }
}`;
var log = _chunkQBR7BSWBjs.createModuleLogger.call(void 0, _chunkQBR7BSWBjs.projectLogger, "lens");
var _isEnabled;
var LensNameProvider = class {
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
    const { value } = request;
    const variables = { address: value };
    log("Sending request", { variables });
    try {
      const responseData = await _chunkMBPHCUIOjs.graphQL.call(void 0, 
        LENS_URL,
        QUERY,
        variables
      );
      const profiles = responseData?.profiles?.items ?? [];
      const proposedNames = profiles.map((profile) => profile.handle);
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



exports.LensNameProvider = LensNameProvider;
//# sourceMappingURL=chunk-DLTFFNBS.js.map