// src/QueuedRequestMiddleware.ts
import { createAsyncMiddleware } from "@metamask/json-rpc-engine";
import { serializeError } from "@metamask/rpc-errors";
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
  return createAsyncMiddleware(async (req, res, next) => {
    hasRequiredMetadata(req);
    if (!useRequestQueue() || !shouldEnqueueRequest(req)) {
      return await next();
    }
    try {
      await enqueueRequest(req, next);
    } catch (error) {
      res.error = serializeError(error);
    }
    return void 0;
  });
};

export {
  createQueuedRequestMiddleware
};
//# sourceMappingURL=chunk-NJPL7WSI.mjs.map