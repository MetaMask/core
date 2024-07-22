import {
  createModuleLogger,
  projectLogger
} from "./chunk-DKF5XCNY.mjs";
import {
  __privateAdd,
  __privateGet,
  __privateMethod,
  __privateSet
} from "./chunk-XUI43LEZ.mjs";

// src/helpers/Bundler.ts
var log = createModuleLogger(projectLogger, "bundler");
var _url, _query, query_fn;
var Bundler = class {
  constructor(url) {
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __privateAdd(this, _query);
    __privateAdd(this, _url, void 0);
    __privateSet(this, _url, url);
  }
  /**
   * Estimate the gas required to execute a user operation.
   *
   * @param userOperation - The user operation to estimate gas for.
   * @param entrypoint - The address of entrypoint to use for the user operation.
   * @returns The estimated gas limits for the user operation.
   */
  async estimateUserOperationGas(userOperation, entrypoint) {
    log("Estimating gas", { url: __privateGet(this, _url), userOperation, entrypoint });
    const response = await __privateMethod(this, _query, query_fn).call(this, "eth_estimateUserOperationGas", [userOperation, entrypoint]);
    log("Estimated gas", { response });
    return response;
  }
  /**
   * Retrieve the receipt for a user operation.
   * @param hash - The hash of the user operation.
   * @returns The receipt for the user operation, or `undefined` if the user operation is pending.
   */
  async getUserOperationReceipt(hash) {
    log("Getting user operation receipt", { url: __privateGet(this, _url), hash });
    return await __privateMethod(this, _query, query_fn).call(this, "eth_getUserOperationReceipt", [hash]);
  }
  /**
   * Submit a user operation to the bundler.
   * @param userOperation - The signed user operation to submit.
   * @param entrypoint - The address of entrypoint to use for the user operation.
   * @returns The hash of the user operation.
   */
  async sendUserOperation(userOperation, entrypoint) {
    log("Sending user operation", {
      url: __privateGet(this, _url),
      userOperation,
      entrypoint
    });
    const hash = await __privateMethod(this, _query, query_fn).call(this, "eth_sendUserOperation", [
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
  const response = await fetch(__privateGet(this, _url), request);
  const responseJson = await response.json();
  if (responseJson.error) {
    const error = new Error(responseJson.error.message || responseJson.error);
    error.code = responseJson.error.code;
    throw error;
  }
  return responseJson.result;
};

export {
  Bundler
};
//# sourceMappingURL=chunk-GURRJAHH.mjs.map