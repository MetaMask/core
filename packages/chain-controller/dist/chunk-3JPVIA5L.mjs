import {
  __privateAdd,
  __privateGet,
  __privateSet
} from "./chunk-XUI43LEZ.mjs";

// src/SnapHandlerClient.ts
import { HandlerType } from "@metamask/snaps-utils";
import { v4 as uuid } from "uuid";
var _snapId, _origin, _handler, _handlerType;
var SnapHandlerSender = class {
  /**
   * Constructor for `SnapHandlerSender`.
   *
   * @param handler - The Snap request handler to send requests to.
   * @param handlerType - The handler type.
   * @param snapId - The ID of the snap to use.
   * @param origin - The sender's origin.
   */
  constructor(handler, handlerType, snapId, origin) {
    __privateAdd(this, _snapId, void 0);
    __privateAdd(this, _origin, void 0);
    __privateAdd(this, _handler, void 0);
    __privateAdd(this, _handlerType, void 0);
    __privateSet(this, _snapId, snapId);
    __privateSet(this, _origin, origin);
    __privateSet(this, _handler, handler);
    __privateSet(this, _handlerType, handlerType);
  }
  /**
   * Sends a request to the snap and return the response.
   *
   * @param request - JSON-RPC request to send to the snap.
   * @returns A promise that resolves to the response of the request.
   */
  async send(request) {
    return __privateGet(this, _handler).call(this, {
      snapId: __privateGet(this, _snapId),
      origin: __privateGet(this, _origin),
      handler: __privateGet(this, _handlerType),
      request
    });
  }
};
_snapId = new WeakMap();
_origin = new WeakMap();
_handler = new WeakMap();
_handlerType = new WeakMap();
var _handler2, _sender;
var SnapHandlerClient = class {
  /**
   * Constructor for SnapHandlerClient.
   *
   * @param options - The client options.
   * @param options.handler - A function to submit requests to the Snap handler
   * (this should call the SnapController.handleRequest)
   * @param options.snapId - The Snap ID.
   * @param options.origin - The origin from which the Snap is being invoked.
   */
  constructor({
    handler,
    // Follow same pattern than for @metamask/keyring-api
    snapId,
    origin = "metamask"
  }) {
    __privateAdd(this, _handler2, void 0);
    __privateAdd(this, _sender, void 0);
    /**
     * Submit a request to the underlying SnapHandlerSender.
     *
     * @param method - The RPC handler method to be called.
     * @param params - The RPC handler parameters.
     * @returns The RPC handler response.
     */
    this.submitRequest = async (method, params) => await __privateGet(this, _sender).send({
      jsonrpc: "2.0",
      method,
      params,
      id: uuid()
      // TODO: Should allow caller to define this one
    });
    __privateSet(this, _handler2, handler);
    __privateSet(this, _sender, new SnapHandlerSender(
      handler,
      HandlerType.OnRpcRequest,
      snapId,
      origin
    ));
  }
};
_handler2 = new WeakMap();
_sender = new WeakMap();

export {
  SnapHandlerClient
};
//# sourceMappingURL=chunk-3JPVIA5L.mjs.map