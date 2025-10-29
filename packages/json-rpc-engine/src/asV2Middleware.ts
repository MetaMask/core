import { serializeError } from '@metamask/rpc-errors';
import type { JsonRpcFailure, JsonRpcResponse } from '@metamask/utils';
import {
  hasProperty,
  type Json,
  type JsonRpcParams,
  type JsonRpcRequest,
} from '@metamask/utils';

import type {
  JsonRpcEngineEndCallback,
  JsonRpcEngineNextCallback,
} from './JsonRpcEngine';
import {
  JsonRpcEngine,
  type JsonRpcMiddleware as LegacyMiddleware,
} from './JsonRpcEngine';
import { mergeMiddleware } from './mergeMiddleware';
import {
  deepClone,
  fromLegacyRequest,
  propagateToContext,
  propagateToRequest,
  unserializeError,
} from './v2/compatibility-utils';
import type {
  // JsonRpcEngineV2 is used in docs.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  JsonRpcEngineV2,
  JsonRpcMiddleware,
  ResultConstraint,
} from './v2/JsonRpcEngineV2';

/**
 * Convert a legacy {@link JsonRpcEngine} into a {@link JsonRpcEngineV2} middleware.
 *
 * @param engine - The legacy engine to convert.
 * @returns The {@link JsonRpcEngineV2} middleware.
 */
export function asV2Middleware<
  Params extends JsonRpcParams,
  Request extends JsonRpcRequest<Params>,
>(engine: JsonRpcEngine): JsonRpcMiddleware<Request>;

/**
 * Convert one or more legacy middlewares into a {@link JsonRpcEngineV2} middleware.
 *
 * @param middlewares - The legacy middleware(s) to convert.
 * @returns The {@link JsonRpcEngineV2} middleware.
 */
export function asV2Middleware<
  Params extends JsonRpcParams,
  Request extends JsonRpcRequest<Params>,
>(
  ...middlewares: LegacyMiddleware<JsonRpcParams, Json>[]
): JsonRpcMiddleware<Request>;

/**
 * Convert an array of legacy middlewares into a {@link JsonRpcEngineV2} middleware.
 *
 * @param middlewares - The array of legacy middlewares to convert.
 * @returns The {@link JsonRpcEngineV2} middleware.
 */
export function asV2Middleware<
  Params extends JsonRpcParams,
  Request extends JsonRpcRequest<Params>,
>(middlewares: LegacyMiddleware<JsonRpcParams, Json>[]): JsonRpcMiddleware<Request>;

export function asV2Middleware<
  Params extends JsonRpcParams,
  Request extends JsonRpcRequest<Params>,
>(
  engineOrMiddleware:
    | JsonRpcEngine
    | LegacyMiddleware<JsonRpcParams, Json>
    | LegacyMiddleware<JsonRpcParams, Json>[],
  ...rest: LegacyMiddleware<JsonRpcParams, Json>[]
): JsonRpcMiddleware<Request> {
  // Determine the legacy middleware function from input(s)
  const middleware =
    engineOrMiddleware instanceof JsonRpcEngine
      ? engineOrMiddleware.asMiddleware()
      : mergeMiddleware(
          Array.isArray(engineOrMiddleware)
            ? engineOrMiddleware
            : [engineOrMiddleware, ...rest],
        );
  return async ({ request, context, next }) => {
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

    if (hasProperty(response, 'error')) {
      throw unserializeError(response.error);
    } else if (hasProperty(response, 'result')) {
      return response.result as ResultConstraint<Request>;
    }
    return next(fromLegacyRequest(req as Request));
  };
}
