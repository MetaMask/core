import { JsonRpcEngine, JsonRpcMiddleware } from './JsonRpcEngine';

/**
 * Takes a stack of middleware and joins them into a single middleware function.
 *
 * @param middlewareStack - The middleware stack to merge.
 * @returns The merged middleware function.
 */
export function mergeMiddleware(
  middlewareStack: JsonRpcMiddleware<unknown, unknown>[],
) {
  const engine = new JsonRpcEngine();
  middlewareStack.forEach((middleware) => engine.push(middleware));
  return engine.asMiddleware();
}
