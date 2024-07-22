"use strict";Object.defineProperty(exports, "__esModule", {value: true});


var _chunkKQMYR73Xjs = require('./chunk-KQMYR73X.js');





var _chunkZ4BLTVTBjs = require('./chunk-Z4BLTVTB.js');

// src/helpers/Bundler.ts
var log = _chunkKQMYR73Xjs.createModuleLogger.call(void 0, _chunkKQMYR73Xjs.projectLogger, "bundler");
var _url, _query, query_fn;
var Bundler = class {
  constructor(url) {
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _query);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _url, void 0);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _url, url);
  }
  /**
   * Estimate the gas required to execute a user operation.
   *
   * @param userOperation - The user operation to estimate gas for.
   * @param entrypoint - The address of entrypoint to use for the user operation.
   * @returns The estimated gas limits for the user operation.
   */
  async estimateUserOperationGas(userOperation, entrypoint) {
    log("Estimating gas", { url: _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _url), userOperation, entrypoint });
    const response = await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _query, query_fn).call(this, "eth_estimateUserOperationGas", [userOperation, entrypoint]);
    log("Estimated gas", { response });
    return response;
  }
  /**
   * Retrieve the receipt for a user operation.
   * @param hash - The hash of the user operation.
   * @returns The receipt for the user operation, or `undefined` if the user operation is pending.
   */
  async getUserOperationReceipt(hash) {
    log("Getting user operation receipt", { url: _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _url), hash });
    return await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _query, query_fn).call(this, "eth_getUserOperationReceipt", [hash]);
  }
  /**
   * Submit a user operation to the bundler.
   * @param userOperation - The signed user operation to submit.
   * @param entrypoint - The address of entrypoint to use for the user operation.
   * @returns The hash of the user operation.
   */
  async sendUserOperation(userOperation, entrypoint) {
    log("Sending user operation", {
      url: _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _url),
      userOperation,
      entrypoint
    });
    const hash = await _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _query, query_fn).call(this, "eth_sendUserOperation", [
      userOperation,
      entrypoint
    ]);
    log("Sent user operation", hash);
    return hash;
  }
};
_url = new WeakMap();
_query = new WeakSet();
query_fn = async function(method, params) {
  const request = {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  };
  const response = await fetch(_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _url), request);
  const responseJson = await response.json();
  if (responseJson.error) {
    const error = new Error(responseJson.error.message || responseJson.error);
    error.code = responseJson.error.code;
    throw error;
  }
  return responseJson.result;
};



exports.Bundler = Bundler;
//# sourceMappingURL=chunk-U7OA6TZZ.js.map