import {
  handleFetch
} from "./chunk-I7E4M4JQ.mjs";
import {
  createModuleLogger,
  projectLogger
} from "./chunk-L244TFFU.mjs";
import {
  __privateAdd,
  __privateGet,
  __privateSet
} from "./chunk-XUI43LEZ.mjs";

// src/providers/token.ts
var ID = "token";
var LABEL = "Blockchain (Token Name)";
var log = createModuleLogger(projectLogger, "token");
var _isEnabled;
var TokenNameProvider = class {
  constructor({ isEnabled } = {}) {
    __privateAdd(this, _isEnabled, void 0);
    __privateSet(this, _isEnabled, isEnabled || (() => true));
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
    const url = `https://token.api.cx.metamask.io/token/${chainId}?address=${value}`;
    log("Sending request", url);
    try {
      const responseData = await handleFetch(url);
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

export {
  TokenNameProvider
};
//# sourceMappingURL=chunk-B35VGJ7B.mjs.map