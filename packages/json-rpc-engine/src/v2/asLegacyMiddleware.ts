import type { JsonRpcParams, JsonRpcRequest } from '@metamask/utils';

import {
  deepClone,
  fromLegacyRequest,
  makeContext,
  propagateToRequest,
} from './compatibility-utils';
import type { JsonRpcMiddleware, ResultConstraint } from './JsonRpcEngineV2';
import { JsonRpcEngineV2 } from './JsonRpcEngineV2';
import { createAsyncMiddleware } from '..';
import type { JsonRpcMiddleware as LegacyMiddleware } from '..';

/**
 * Convert a {@link JsonRpcEngineV2} into a legacy middleware.
 *
 * @param engine - The engine to convert.
 * @returns The legacy middleware.
 */
export function asLegacyMiddleware<
  Params extends JsonRpcParams,
  Request extends JsonRpcRequest<Params>,
>(
  engine: JsonRpcEngineV2<Request>,
): LegacyMiddleware<Params, ResultConstraint<Request>>;

/**
 * Convert one or more V2 middlewares into a legacy middleware.
 *
 * @param middleware - The V2 middleware(s) to convert.
 * @returns The legacy middleware.
 */
export function asLegacyMiddleware<
  Params extends JsonRpcParams,
  Request extends JsonRpcRequest<Params>,
>(
  ...middleware: JsonRpcMiddleware<Request, ResultConstraint<Request>>[]
): LegacyMiddleware<Params, ResultConstraint<Request>>;

/**
 * Implementation of asLegacyMiddleware that handles all input types.
 *
 * @param engineOrMiddleware - A V2 engine, a single V2 middleware, or an array of V2 middleware.
 * @param rest - Additional V2 middleware when the first argument is a single middleware.
 * @returns The legacy middleware.
 */
export function asLegacyMiddleware<
  Params extends JsonRpcParams,
  Request extends JsonRpcRequest<Params>,
>(
  engineOrMiddleware:
    | JsonRpcEngineV2<Request>
    | JsonRpcMiddleware<Request, ResultConstraint<Request>>,
  ...rest: JsonRpcMiddleware<Request, ResultConstraint<Request>>[]
): LegacyMiddleware<Params, ResultConstraint<Request>> {
  const JsonRpcMiddleware =
    typeof engineOrMiddleware === 'function'
      ? JsonRpcEngineV2.create({
          middleware: [engineOrMiddleware, ...rest],
        }).asMiddleware()
      : engineOrMiddleware.asMiddleware();

  return createAsyncMiddleware(async (req, res, next) => {
    const request = fromLegacyRequest(req as Request);
    const context = makeContext(req);
    let modifiedRequest: Request | undefined;

    const result = await JsonRpcMiddleware({
      request,
      context,
      next: (finalRequest) => {
        modifiedRequest = finalRequest as Request | undefined;
        return Promise.resolve(undefined);
      },
    });

    if (modifiedRequest !== undefined && modifiedRequest !== request) {
      Object.assign(req, deepClone(modifiedRequest));
    }
    propagateToRequest(req, context);

    if (result !== undefined) {
      // Unclear why the `as unknown` is needed here, but the cast is safe.
      res.result = deepClone(result) as unknown as ResultConstraint<Request>;
      return undefined;
    }
    return next();
  });
}
