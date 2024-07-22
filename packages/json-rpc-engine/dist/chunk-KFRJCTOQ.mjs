import {
  JsonRpcEngine
} from "./chunk-5HCYV4FV.mjs";

// src/mergeMiddleware.ts
function mergeMiddleware(middlewareStack) {
  const engine = new JsonRpcEngine();
  middlewareStack.forEach((middleware) => engine.push(middleware));
  return engine.asMiddleware();
}

export {
  mergeMiddleware
};
//# sourceMappingURL=chunk-KFRJCTOQ.mjs.map