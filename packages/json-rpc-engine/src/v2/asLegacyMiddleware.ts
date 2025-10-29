import type { JsonRpcParams, JsonRpcRequest } from '@metamask/utils';

import {
  deepClone,
  fromLegacyRequest,
  makeContext,
  propagateToRequest,
} from './compatibility-utils';
import type {
  JsonRpcEngineV2,
  JsonRpcMiddleware as V2Middleware,
  ResultConstraint,
} from './JsonRpcEngineV2';
import { JsonRpcEngineV2 as EngineV2 } from './JsonRpcEngineV2';
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
  ...middleware: V2Middleware<Request, ResultConstraint<Request>>[]
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
    | V2Middleware<Request, ResultConstraint<Request>>,
  ...rest: V2Middleware<Request, ResultConstraint<Request>>[]
): LegacyMiddleware<Params, ResultConstraint<Request>> {
  // Determine the V2 middleware function from input(s)
  const middleware =
    typeof engineOrMiddleware === 'function'
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        EngineV2.create<any>({
          middleware: [engineOrMiddleware, ...rest],
        }).asMiddleware()
      : engineOrMiddleware.asMiddleware();
  return createAsyncMiddleware(async (req, res, next) => {
    const request = fromLegacyRequest(req as Request);
    const context = makeContext(req);
    let modifiedRequest: Request | undefined;

    const result = await middleware({
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
