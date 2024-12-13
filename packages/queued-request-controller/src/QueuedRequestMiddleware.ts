import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine';
import { createAsyncMiddleware } from '@metamask/json-rpc-engine';
import { serializeError } from '@metamask/rpc-errors';
import type { Json, JsonRpcParams, JsonRpcRequest } from '@metamask/utils';

import type { QueuedRequestController } from './QueuedRequestController';
import type { QueuedRequestMiddlewareJsonRpcRequest } from './types';

/**
 * Ensure that the incoming request has the additional required request metadata. This metadata
 * should be attached to the request earlier in the middleware pipeline.
 *
 * @param request - The request to check.
 * @throws Throws an error if any required metadata is missing.
 */
function hasRequiredMetadata(
  request: Record<string, unknown>,
): asserts request is QueuedRequestMiddlewareJsonRpcRequest {
  if (!request.origin) {
    throw new Error("Request object is lacking an 'origin'");
  } else if (typeof request.origin !== 'string') {
    throw new Error(
      `Request object has an invalid origin of type '${typeof request.origin}'`,
    );
  } else if (!request.networkClientId) {
    throw new Error("Request object is lacking a 'networkClientId'");
  } else if (typeof request.networkClientId !== 'string') {
    throw new Error(
      `Request object has an invalid networkClientId of type '${typeof request.networkClientId}'`,
    );
  }
}

/**
 * Creates a JSON-RPC middleware for handling queued requests. This middleware
 * intercepts JSON-RPC requests, checks if they require queueing, and manages
 * their execution based on the specified options.
 *
 * @param options - Configuration options.
 * @param options.enqueueRequest - A method for enqueueing a request.
 * @param options.useRequestQueue - A function that determines if the request queue feature is enabled.
 * @param options.shouldEnqueueRequest - A function that returns if a request should be handled by the QueuedRequestController.
 * @returns The JSON-RPC middleware that manages queued requests.
 */
export const createQueuedRequestMiddleware = ({
  enqueueRequest,
  useRequestQueue,
  shouldEnqueueRequest,
}: {
  enqueueRequest: QueuedRequestController['enqueueRequest'];
  useRequestQueue: () => boolean;
  shouldEnqueueRequest: (
    request: QueuedRequestMiddlewareJsonRpcRequest,
  ) => boolean;
}): JsonRpcMiddleware<JsonRpcParams, Json> => {
  return createAsyncMiddleware(async (req: JsonRpcRequest, res, next) => {
    hasRequiredMetadata(req);

    // if the request queue feature is turned off, or this method is not a confirmation method
    // bypass the queue completely
    if (!useRequestQueue() || !shouldEnqueueRequest(req)) {
      return await next();
    }

    try {
      await enqueueRequest(req, next);
    } catch (error: unknown) {
      res.error = serializeError(error);
    }
    return undefined;
  });
};
