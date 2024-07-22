"use strict";Object.defineProperty(exports, "__esModule", {value: true});

var _chunkXQXO5QPMjs = require('./chunk-XQXO5QPM.js');



var _chunkMBPHCUIOjs = require('./chunk-MBPHCUIO.js');



var _chunkQBR7BSWBjs = require('./chunk-QBR7BSWB.js');





var _chunkZ4BLTVTBjs = require('./chunk-Z4BLTVTB.js');

// src/providers/etherscan.ts
var _asyncmutex = require('async-mutex');
var ID = "etherscan";
var LABEL = "Etherscan (Verified Contract Name)";
var RATE_LIMIT_UPDATE_DELAY = 5;
var RATE_LIMIT_INTERVAL = RATE_LIMIT_UPDATE_DELAY * 1e3;
var log = _chunkQBR7BSWBjs.createModuleLogger.call(void 0, _chunkQBR7BSWBjs.projectLogger, "etherscan");
var _isEnabled, _lastRequestTime, _mutex, _sendRequest, sendRequest_fn, _getUrl, getUrl_fn;
var EtherscanNameProvider = class {
  constructor({ isEnabled } = {}) {
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _sendRequest);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _getUrl);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _isEnabled, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _lastRequestTime, 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _mutex, new (0, _asyncmutex.Mutex)());
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
    const releaseLock = await _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _mutex).acquire();
    try {
      const { value, variation: chainId } = request;
      const time = Date.now();
      const timeSinceLastRequest = time - _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _lastRequestTime);
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
      const url = _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _getUrl, getUrl_fn).call(this, chainId, {
        module: "contract",
        action: "getsourcecode",
        address: value
      });
      const { responseData, error } = await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _sendRequest, sendRequest_fn).call(this, url);
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
    const responseData = await _chunkMBPHCUIOjs.handleFetch.call(void 0, 
      url
    );
    return { responseData };
  } catch (error) {
    _chunkMBPHCUIOjs.assertIsError.call(void 0, error);
    return { error };
  } finally {
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _lastRequestTime, Date.now());
  }
};
_getUrl = new WeakSet();
getUrl_fn = function(chainId, params) {
  const networkInfo = _chunkXQXO5QPMjs.ETHERSCAN_SUPPORTED_NETWORKS[chainId];
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



exports.EtherscanNameProvider = EtherscanNameProvider;
//# sourceMappingURL=chunk-KLGAH2TJ.js.map