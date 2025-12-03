import { serializeError } from '@metamask/rpc-errors';
import { hasProperty } from '@metamask/utils';
import type { JsonRpcFailure, JsonRpcResponse } from '@metamask/utils';
import type { Json, JsonRpcParams, JsonRpcRequest } from '@metamask/utils';

import type {
  JsonRpcEngine,
  JsonRpcEngineEndCallback,
  JsonRpcEngineNextCallback,
} from './JsonRpcEngine';
import type { JsonRpcMiddleware as LegacyMiddleware } from './JsonRpcEngine';
import { mergeMiddleware } from './mergeMiddleware';
import type { ContextConstraint, MiddlewareContext } from './v2';
import {
  deepClone,
  fromLegacyRequest,
  propagateToContext,
  propagateToRequest,
  deserializeError,
} from './v2/compatibility-utils';
import type {
  // Used in docs.
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
 * Convert one or more legacy middleware into a {@link JsonRpcEngineV2} middleware.
 *
 * @param middleware - The legacy middleware to convert.
 * @returns The {@link JsonRpcEngineV2} middleware.
 */
export function asV2Middleware<
  Params extends JsonRpcParams = JsonRpcParams,
  Request extends JsonRpcRequest<Params> = JsonRpcRequest<Params>,
  Result extends ResultConstraint<Request> = ResultConstraint<Request>,
  Context extends ContextConstraint = MiddlewareContext,
>(
  ...middleware: LegacyMiddleware<Params, Result>[]
): JsonRpcMiddleware<Request, Result, Context>;

/**
 * The asV2Middleware implementation.
 *
 * @param engineOrMiddleware - A legacy engine or legacy middleware.
 * @param rest - Any additional legacy middleware when the first argument is a middleware.
 * @returns The {@link JsonRpcEngineV2} middleware.
 */
export function asV2Middleware<
  Params extends JsonRpcParams,
  Request extends JsonRpcRequest<Params>,
>(
  engineOrMiddleware: JsonRpcEngine | LegacyMiddleware<JsonRpcParams, Json>,
  ...rest: LegacyMiddleware<JsonRpcParams, Json>[]
): JsonRpcMiddleware<Request> {
  const legacyMiddleware =
    typeof engineOrMiddleware === 'function'
      ? // mergeMiddleware uses .asMiddleware() internally, which is necessary for our purposes.
        // See comment on this below.
        mergeMiddleware([engineOrMiddleware, ...rest])
      : engineOrMiddleware.asMiddleware();

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

      legacyMiddleware(req, res, legacyNext, end);
    });
    propagateToContext(req, context);

    // Mimic the behavior of JsonRpcEngine.#handle(), which only treats truthy errors as errors.
    // Legacy middleware may violate the invariant that response objects have either a result or an
    // error property. In practice, we may see response objects with results and `{ error: undefined }`.
    if (hasProperty(response, 'error') && response.error) {
      throw deserializeError(response.error);
    } else if (hasProperty(response, 'result')) {
      return response.result as ResultConstraint<Request>;
    }
    return next(fromLegacyRequest(req as Request));
  };
}
