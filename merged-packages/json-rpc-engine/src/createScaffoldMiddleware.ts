import { Json, JsonRpcMiddleware, JsonRpcSuccess } from './JsonRpcEngine';

type ScaffoldMiddlewareHandler<T, U> = JsonRpcMiddleware<T, U> | Json;

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
