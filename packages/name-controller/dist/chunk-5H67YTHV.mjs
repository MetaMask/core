import {
  graphQL
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
var log = createModuleLogger(projectLogger, "lens");
var _isEnabled;
var LensNameProvider = class {
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
    const { value } = request;
    const variables = { address: value };
    log("Sending request", { variables });
    try {
      const responseData = await graphQL(
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

export {
  LensNameProvider
};
//# sourceMappingURL=chunk-5H67YTHV.mjs.map