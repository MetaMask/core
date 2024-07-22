"use strict";Object.defineProperty(exports, "__esModule", {value: true});



var _chunkZ4BLTVTBjs = require('./chunk-Z4BLTVTB.js');

// src/SnapHandlerClient.ts
var _snapsutils = require('@metamask/snaps-utils');
var _uuid = require('uuid');
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
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _snapId, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _origin, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _handler, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _handlerType, void 0);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _snapId, snapId);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _origin, origin);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _handler, handler);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _handlerType, handlerType);
  }
  /**
   * Sends a request to the snap and return the response.
   *
   * @param request - JSON-RPC request to send to the snap.
   * @returns A promise that resolves to the response of the request.
   */
  async send(request) {
    return _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _handler).call(this, {
      snapId: _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _snapId),
      origin: _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _origin),
      handler: _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _handlerType),
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
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _handler2, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _sender, void 0);
    /**
     * Submit a request to the underlying SnapHandlerSender.
     *
     * @param method - The RPC handler method to be called.
     * @param params - The RPC handler parameters.
     * @returns The RPC handler response.
     */
    this.submitRequest = async (method, params) => await _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _sender).send({
      jsonrpc: "2.0",
      method,
      params,
      id: _uuid.v4.call(void 0, )
      // TODO: Should allow caller to define this one
    });
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _handler2, handler);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _sender, new SnapHandlerSender(
      handler,
      _snapsutils.HandlerType.OnRpcRequest,
      snapId,
      origin
    ));
  }
};
_handler2 = new WeakMap();
_sender = new WeakMap();



exports.SnapHandlerClient = SnapHandlerClient;
//# sourceMappingURL=chunk-ZS3LBXVM.js.map