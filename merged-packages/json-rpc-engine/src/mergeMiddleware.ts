import { JsonRpcEngine, JsonRpcMiddleware } from './JsonRpcEngine';

export function mergeMiddleware(
  middlewareStack: JsonRpcMiddleware<unknown, unknown>[],
) {
  const engine = new JsonRpcEngine();
  middlewareStack.forEach((middleware) => engine.push(middleware));
  return engine.asMiddleware();
}
