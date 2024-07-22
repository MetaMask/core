import {
  ETHERSCAN_SUPPORTED_NETWORKS
} from "./chunk-SHTSUEYM.mjs";
import {
  assertIsError,
  handleFetch
} from "./chunk-I7E4M4JQ.mjs";
import {
  createModuleLogger,
  projectLogger
} from "./chunk-L244TFFU.mjs";
import {
  __privateAdd,
  __privateGet,
  __privateMethod,
  __privateSet
} from "./chunk-XUI43LEZ.mjs";

// src/providers/etherscan.ts
import { Mutex } from "async-mutex";
var ID = "etherscan";
var LABEL = "Etherscan (Verified Contract Name)";
var RATE_LIMIT_UPDATE_DELAY = 5;
var RATE_LIMIT_INTERVAL = RATE_LIMIT_UPDATE_DELAY * 1e3;
var log = createModuleLogger(projectLogger, "etherscan");
var _isEnabled, _lastRequestTime, _mutex, _sendRequest, sendRequest_fn, _getUrl, getUrl_fn;
var EtherscanNameProvider = class {
  constructor({ isEnabled } = {}) {
    __privateAdd(this, _sendRequest);
    __privateAdd(this, _getUrl);
    __privateAdd(this, _isEnabled, void 0);
    __privateAdd(this, _lastRequestTime, 0);
    __privateAdd(this, _mutex, new Mutex());
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
    const releaseLock = await __privateGet(this, _mutex).acquire();
    try {
      const { value, variation: chainId } = request;
      const time = Date.now();
      const timeSinceLastRequest = time - __privateGet(this, _lastRequestTime);
      if (timeSinceLastRequest < RATE_LIMIT_INTERVAL) {
        log("Skipping request to avoid rate limit");
        return {
          results: {
            [ID]: {
              updateDelay: RATE_LIMIT_UPDATE_DELAY
            }
          }
        };
      }
      const url = __privateMethod(this, _getUrl, getUrl_fn).call(this, chainId, {
        module: "contract",
        action: "getsourcecode",
        address: value
      });
      const { responseData, error } = await __privateMethod(this, _sendRequest, sendRequest_fn).call(this, url);
      if (error) {
        log("Request failed", error);
        throw error;
      }
      if (responseData?.message === "NOTOK") {
        log("Request warning", responseData.result);
        return {
          results: {
            [ID]: {
              updateDelay: RATE_LIMIT_UPDATE_DELAY
            }
          }
        };
      }
      const results = responseData?.result ?? [];
      const proposedNames = results.map((result) => result.ContractName);
      log("New proposed names", proposedNames);
      return {
        results: {
          [ID]: {
            proposedNames
          }
        }
      };
    } finally {
      releaseLock();
    }
  }
};
_isEnabled = new WeakMap();
_lastRequestTime = new WeakMap();
_mutex = new WeakMap();
_sendRequest = new WeakSet();
sendRequest_fn = async function(url) {
  try {
    log("Sending request", url);
    const responseData = await handleFetch(
      url
    );
    return { responseData };
  } catch (error) {
    assertIsError(error);
    return { error };
  } finally {
    __privateSet(this, _lastRequestTime, Date.now());
  }
};
_getUrl = new WeakSet();
getUrl_fn = function(chainId, params) {
  const networkInfo = ETHERSCAN_SUPPORTED_NETWORKS[chainId];
  if (!networkInfo) {
    throw new Error(`Etherscan does not support chain with ID: ${chainId}`);
  }
  let url = `https://${networkInfo.subdomain}.${networkInfo.domain}/api`;
  Object.keys(params).forEach((key, index) => {
    const value = params[key];
    url += `${index === 0 ? "?" : "&"}${key}=${value}`;
  });
  return url;
};

export {
  EtherscanNameProvider
};
//# sourceMappingURL=chunk-MVITILLI.mjs.map