import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine';
import type { Json, JsonRpcParams } from '@metamask/utils';
import type { QueuedRequestController } from './QueuedRequestController';
import type { QueuedRequestMiddlewareJsonRpcRequest } from './types';
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
export declare const createQueuedRequestMiddleware: ({ enqueueRequest, useRequestQueue, shouldEnqueueRequest, }: {
    enqueueRequest: QueuedRequestController['enqueueRequest'];
    useRequestQueue: () => boolean;
    shouldEnqueueRequest: (request: QueuedRequestMiddlewareJsonRpcRequest) => boolean;
}) => JsonRpcMiddleware<JsonRpcParams, Json>;
//# sourceMappingURL=QueuedRequestMiddleware.d.ts.map