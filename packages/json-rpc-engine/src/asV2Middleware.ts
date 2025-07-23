import { serializeError } from '@metamask/rpc-errors';
import type { JsonRpcFailure, JsonRpcResponse } from '@metamask/utils';
import {
  type Json,
  type JsonRpcParams,
  type JsonRpcRequest,
} from '@metamask/utils';

import type {
  JsonRpcEngine,
  JsonRpcEngineEndCallback,
  JsonRpcEngineNextCallback,
} from './JsonRpcEngine';
import {
  deepClone,
  fromLegacyRequest,
  propagateToContext,
  propagateToRequest,
  unserializeError,
} from './v2/compatibility-utils';
// JsonRpcEngineV2 is used in docs.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { JsonRpcMiddleware, JsonRpcEngineV2 } from './v2/JsonRpcEngineV2';

/**
 * Convert a legacy {@link JsonRpcEngine} into a {@link JsonRpcEngineV2} middleware.
 *
 * @param engine - The legacy engine to convert.
 * @returns The {@link JsonRpcEngineV2} middleware.
 */
export function asV2Middleware<
  Params extends JsonRpcParams,
  Request extends JsonRpcRequest<Params>,
  Result extends Json,
>(engine: JsonRpcEngine): JsonRpcMiddleware<Request, Result> {
  const middleware = engine.asMiddleware();
  return async ({ request, context, next }): Promise<Result | void> => {
    const req = deepClone(request) as JsonRpcRequest<Params>;
    propagateToRequest(req, context);

    const response = await new Promise<JsonRpcResponse>((resolve) => {
      // The result or error property will be set by the legacy engine
      // middleware.
      const res = {
        jsonrpc: '2.0' as const,
        id: req.id,
      } as JsonRpcResponse;

      const end: JsonRpcEngineEndCallback = (error) => {
        if (error !== undefined) {
          (res as JsonRpcFailure).error = serializeError(error);
        }
        resolve(res);
      };

      // We know from the implementation of JsonRpcEngine.asMiddleware() that
      // legacyNext will always be passed a callback, so cb can never be
      // undefined.
      const legacyNext = ((cb: JsonRpcEngineEndCallback) =>
        cb(end)) as JsonRpcEngineNextCallback;

      middleware(req, res, legacyNext, end);
    });
    propagateToContext(req, context);

    if ('error' in response) {
      throw unserializeError(response.error);
    } else if ('result' in response) {
      return response.result as Result;
    }
    return next(fromLegacyRequest(req as Request));
  };
}
