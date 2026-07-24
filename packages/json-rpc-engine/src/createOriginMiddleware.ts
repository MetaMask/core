import { Json, JsonRpcRequest } from '@metamask/utils';

import { JsonRpcMiddleware } from './JsonRpcEngine.js';

/**
 * Create a middleware function that adds `origin` to the request object.
 *
 * @deprecated Use the v2 `createOriginMiddleware` instead.
 * @param origin - The origin.
 * @returns The middleware.
 */
export function createOriginMiddleware(
  origin: string,
): JsonRpcMiddleware<JsonRpcRequest, Json> {
  return (request, _result, next) => {
    (request as unknown as JsonRpcRequest & { origin: string }).origin = origin;
    next();
  };
}
