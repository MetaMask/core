var __accessCheck = (obj, member, msg) => {
  if (!member.has(obj))
    throw TypeError("Cannot " + msg);
};
var __privateGet = (obj, member, getter) => {
  __accessCheck(obj, member, "read from private field");
  return getter ? getter.call(obj) : member.get(obj);
};
var __privateAdd = (obj, member, value) => {
  if (member.has(obj))
    throw TypeError("Cannot add the same private member more than once");
  member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
};
var __privateSet = (obj, member, value, setter) => {
  __accessCheck(obj, member, "write to private field");
  setter ? setter.call(obj, value) : member.set(obj, value);
  return value;
};

// src/safe-event-emitter-provider.ts
import { JsonRpcError } from "@metamask/rpc-errors";
import SafeEventEmitter from "@metamask/safe-event-emitter";
import { v4 as uuidV4 } from "uuid";
function convertEip1193RequestToJsonRpcRequest(eip1193Request) {
  const {
    id = uuidV4(),
    jsonrpc = "2.0",
    method,
    params = {}
  } = eip1193Request;
  return {
    id,
    jsonrpc,
    method,
    params
  };
}
var _engine;
var SafeEventEmitterProvider = class extends SafeEventEmitter {
  /**
   * Construct a SafeEventEmitterProvider from a JSON-RPC engine.
   *
   * @param options - Options.
   * @param options.engine - The JSON-RPC engine used to process requests.
   */
  constructor({ engine }) {
    super();
    __privateAdd(this, _engine, void 0);
    /**
     * Send a provider request asynchronously.
     *
     * This method serves the same purpose as `request`. It only exists for
     * legacy reasons.
     *
     * @param eip1193Request - The request to send.
     * @param callback - A function that is called upon the success or failure of the request.
     * @deprecated Please use `request` instead.
     */
    this.sendAsync = (eip1193Request, callback) => {
      const jsonRpcRequest = convertEip1193RequestToJsonRpcRequest(eip1193Request);
      __privateGet(this, _engine).handle(jsonRpcRequest, callback);
    };
    /**
     * Send a provider request asynchronously.
     *
     * This method serves the same purpose as `request`. It only exists for
     * legacy reasons.
     *
     * @param eip1193Request - The request to send.
     * @param callback - A function that is called upon the success or failure of the request.
     * @deprecated Please use `request` instead.
     */
    this.send = (eip1193Request, callback) => {
      if (typeof callback !== "function") {
        throw new Error('Must provide callback to "send" method.');
      }
      const jsonRpcRequest = convertEip1193RequestToJsonRpcRequest(eip1193Request);
      __privateGet(this, _engine).handle(jsonRpcRequest, callback);
    };
    __privateSet(this, _engine, engine);
    if (engine.on) {
      engine.on("notification", (message) => {
        this.emit("data", null, message);
      });
    }
  }
  /**
   * Send a provider request asynchronously.
   *
   * @param eip1193Request - The request to send.
   * @returns The JSON-RPC response.
   */
  async request(eip1193Request) {
    const jsonRpcRequest = convertEip1193RequestToJsonRpcRequest(eip1193Request);
    const response = await __privateGet(this, _engine).handle(jsonRpcRequest);
    if ("result" in response) {
      return response.result;
    }
    const error = new JsonRpcError(
      response.error.code,
      response.error.message,
      response.error.data
    );
    if ("stack" in response.error) {
      error.stack = response.error.stack;
    }
    throw error;
  }
};
_engine = new WeakMap();

export {
  convertEip1193RequestToJsonRpcRequest,
  SafeEventEmitterProvider
};
//# sourceMappingURL=chunk-LYCRHXV3.mjs.map