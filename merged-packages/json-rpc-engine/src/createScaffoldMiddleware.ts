import { Json, JsonRpcSuccess } from '@metamask/utils';
import { JsonRpcMiddleware } from './JsonRpcEngine';

type ScaffoldMiddlewareHandler<Params, Result> =
  | JsonRpcMiddleware<Params, Result>
  | Json;

/**
 * Creates a middleware function from an object of RPC method handler functions,
 * keyed to particular method names. If a method corresponding to a key of this
 * object is requested, this middleware will pass it to the corresponding
 * handler and return the result.
 *
 * @param handlers - The RPC method handler functions.
 * @returns The scaffold middleware function.
 */
export function createScaffoldMiddleware(handlers: {
  [methodName: string]: ScaffoldMiddlewareHandler<unknown, unknown>;
}): JsonRpcMiddleware<unknown, unknown> {
  return (req, res, next, end) => {
    const handler = handlers[req.method];
    // if no handler, return
    if (handler === undefined) {
      return next();
    }

    // if handler is fn, call as middleware
    if (typeof handler === 'function') {
      return handler(req, res, next, end);
    }
    // if handler is some other value, use as result
    (res as JsonRpcSuccess<unknown>).result = handler;
    return end();
  };
}
