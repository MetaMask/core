import type { Json, JsonRpcParams, JsonRpcRequest } from '@metamask/utils';

import type { JsonRpcMiddleware } from './JsonRpcEngineV2';

// Only permit primitive values as hard-coded scaffold middleware results.
type JsonPrimitive = string | number | boolean | null;

export type ScaffoldMiddlewareHandler<
  Params extends JsonRpcParams,
  Result extends Json,
> = JsonRpcMiddleware<JsonRpcRequest<Params>, Result> | JsonPrimitive;

/**
 * A record of RPC method handler functions or hard-coded results, keyed to particular method names.
 * Only primitive JSON values are permitted as hard-coded results.
 */
export type MiddlewareScaffold = Record<
  string,
  ScaffoldMiddlewareHandler<JsonRpcParams, Json>
>;

/**
 * Creates a middleware function from an object of RPC method handler functions,
 * keyed to particular method names. If a method corresponding to a key of this
 * object is requested, this middleware will pass it to the corresponding
 * handler and return the result.
 *
 * @param handlers - The RPC method handler functions.
 * @returns The scaffold middleware function.
 */
export function createScaffoldMiddleware(
  handlers: MiddlewareScaffold,
): JsonRpcMiddleware<JsonRpcRequest, Json> {
  return ({ request, context, next }) => {
    const handlerOrResult = handlers[request.method];
    if (handlerOrResult === undefined) {
      return next();
    }

    return typeof handlerOrResult === 'function'
      ? handlerOrResult({ request, context, next })
      : handlerOrResult;
  };
}
