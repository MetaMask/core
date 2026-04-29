import { JsonRpcMiddleware } from './JsonRpcEngineV2';
import { MiddlewareContext } from './MiddlewareContext';
import { Json, JsonRpcRequest } from './utils';

/**
 * Create a middleware function that adds `origin` to the middleware context.
 *
 * @param origin - The origin.
 * @returns The middleware.
 */
export function createOriginMiddleware<
  Context extends MiddlewareContext<{ origin: string }>,
>(origin: string): JsonRpcMiddleware<JsonRpcRequest, Json, Context> {
  return ({ context, next }) => {
    context.set('origin', origin);
    return next();
  };
}
