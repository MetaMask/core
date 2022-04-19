import { JsonRpcMiddleware, JsonRpcRequest } from 'json-rpc-engine';

interface CreateHitTrackerMiddleware {
  getHits(method: string): JsonRpcRequest<any>[];
}

export default function createHitTrackerMiddleware() {
  const hitTracker: Record<string, JsonRpcRequest<any>[]> = {};
  const middleware: JsonRpcMiddleware<any, any> & CreateHitTrackerMiddleware = (
    req,
    _res,
    next,
    _end,
  ) => {
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
