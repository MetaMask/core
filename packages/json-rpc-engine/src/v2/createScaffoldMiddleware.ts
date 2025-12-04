import type { Json, JsonRpcParams, JsonRpcRequest } from '@metamask/utils';

import type { JsonRpcMiddleware } from './JsonRpcEngineV2';
import type { ContextConstraint, MiddlewareContext } from './MiddlewareContext';

// Only permit primitive values as hard-coded scaffold middleware results.
type JsonPrimitive = string | number | boolean | null;

/**
 * A handler for a scaffold middleware function.
 *
 * @template Params - The parameters of the request.
 * @template Result - The result of the request.
 * @template Context - The context of the request.
 * @returns A JSON-RPC middleware function or a primitive JSON value.
 */
export type ScaffoldMiddlewareHandler<
  Params extends JsonRpcParams,
  Result extends Json,
  Context extends ContextConstraint,
> = JsonRpcMiddleware<JsonRpcRequest<Params>, Result, Context> | JsonPrimitive;

/**
 * A record of RPC method handler functions or hard-coded results, keyed to particular method names.
 * Only primitive JSON values are permitted as hard-coded results.
 */
export type MiddlewareScaffold<
  Context extends ContextConstraint = MiddlewareContext,
> = Record<string, ScaffoldMiddlewareHandler<JsonRpcParams, Json, Context>>;

/**
 * Creates a middleware function from an object of RPC method handler functions,
 * keyed to particular method names. If a method corresponding to a key of this
 * object is requested, this middleware will pass it to the corresponding
 * handler and return the result.
 *
 * @param handlers - The RPC method handler functions.
 * @returns The scaffold middleware function.
 */
export function createScaffoldMiddleware<Context extends ContextConstraint>(
  handlers: MiddlewareScaffold<Context>,
): JsonRpcMiddleware<JsonRpcRequest, Json, Context> {
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
