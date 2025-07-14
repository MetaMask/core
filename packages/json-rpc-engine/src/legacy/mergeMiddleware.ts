import type { Json, JsonRpcParams } from '@metamask/utils';

import type { JsonRpcMiddleware } from './JsonRpcEngine';
import { JsonRpcEngine } from './JsonRpcEngine';

/**
 * Takes a stack of middleware and joins them into a single middleware function.
 *
 * @deprecated Use `JsonRpcEngineV2` and its corresponding types instead.
 * @param middlewareStack - The middleware stack to merge.
 * @returns The merged middleware function.
 */
export function mergeMiddleware(
  middlewareStack: JsonRpcMiddleware<JsonRpcParams, Json>[],
) {
  const engine = new JsonRpcEngine();
  middlewareStack.forEach((middleware) => engine.push(middleware));
  return engine.asMiddleware();
}
