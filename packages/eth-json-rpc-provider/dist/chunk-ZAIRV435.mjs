import {
  providerFromEngine
} from "./chunk-65HKSEG2.mjs";

// src/provider-from-middleware.ts
import { JsonRpcEngine } from "@metamask/json-rpc-engine";
function providerFromMiddleware(middleware) {
  const engine = new JsonRpcEngine();
  engine.push(middleware);
  const provider = providerFromEngine(engine);
  return provider;
}

export {
  providerFromMiddleware
};
//# sourceMappingURL=chunk-ZAIRV435.mjs.map