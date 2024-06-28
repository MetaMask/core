import type {
  JsonRpcEngineEndCallback,
  JsonRpcEngineNextCallback,
  JsonRpcMiddleware,
} from '@metamask/json-rpc-engine';
import type {
  Json,
  JsonRpcParams,
  JsonRpcRequest,
  PendingJsonRpcResponse,
} from '@metamask/utils';

/**
 * Returns a middleware function that attaches the sender origin to the request.
 *
 * @param options - The middleware options.
 * @param options.origin - The origin of the request sender.
 * @returns The middleware funciton.
 */
export default function createOriginMiddleware({
  origin,
}: {
  origin: string;
}): JsonRpcMiddleware<JsonRpcParams, Json> {
  return function originMiddleware(
    request: JsonRpcRequest,
    _response: PendingJsonRpcResponse<Json>,
    next: JsonRpcEngineNextCallback,
    _end: JsonRpcEngineEndCallback,
  ): void {
    // @ts-expect-error This violates the request type.
    // TODO: Move this to the "context" object, after updating JSON-RPC engine to have a request
    // context.
    request.origin = origin;
    next();
  };
}
