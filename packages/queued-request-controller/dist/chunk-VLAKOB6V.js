"use strict";Object.defineProperty(exports, "__esModule", {value: true});// src/QueuedRequestMiddleware.ts
var _jsonrpcengine = require('@metamask/json-rpc-engine');
var _rpcerrors = require('@metamask/rpc-errors');
function hasRequiredMetadata(request) {
  if (!request.origin) {
    throw new Error("Request object is lacking an 'origin'");
  } else if (typeof request.origin !== "string") {
    throw new Error(
      `Request object has an invalid origin of type '${typeof request.origin}'`
    );
  } else if (!request.networkClientId) {
    throw new Error("Request object is lacking a 'networkClientId'");
  } else if (typeof request.networkClientId !== "string") {
    throw new Error(
      `Request object has an invalid networkClientId of type '${typeof request.networkClientId}'`
    );
  }
}
var createQueuedRequestMiddleware = ({
  enqueueRequest,
  useRequestQueue,
  shouldEnqueueRequest
}) => {
  return _jsonrpcengine.createAsyncMiddleware.call(void 0, async (req, res, next) => {
    hasRequiredMetadata(req);
    if (!useRequestQueue() || !shouldEnqueueRequest(req)) {
      return await next();
    }
    try {
      await enqueueRequest(req, next);
    } catch (error) {
      res.error = _rpcerrors.serializeError.call(void 0, error);
    }
    return void 0;
  });
};



exports.createQueuedRequestMiddleware = createQueuedRequestMiddleware;
//# sourceMappingURL=chunk-VLAKOB6V.js.map