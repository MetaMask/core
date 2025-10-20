import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine';
import type { Json, JsonRpcParams, JsonRpcRequest } from '@metamask/utils';

type CreateHitTrackerMiddleware = {
  getHits(method: string): JsonRpcRequest[];
};

export default function createHitTrackerMiddleware() {
  const hitTracker: Record<string, JsonRpcRequest[]> = {};
  const middleware: JsonRpcMiddleware<JsonRpcParams, Json> &
    CreateHitTrackerMiddleware = (req, _res, next, _end) => {
    // mark hit for method
    const hitsForMethod = hitTracker[req.method] || [];
    hitsForMethod.push(req);
    hitTracker[req.method] = hitsForMethod;
    // continue
    next();
  };
  middleware.getHits = (method: string) => hitTracker[method] || [];
  return middleware;
}
