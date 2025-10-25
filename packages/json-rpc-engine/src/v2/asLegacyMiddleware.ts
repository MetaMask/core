import type { JsonRpcParams, JsonRpcRequest } from '@metamask/utils';

import {
  deepClone,
  fromLegacyRequest,
  makeContext,
  propagateToRequest,
} from './compatibility-utils';
import type { JsonRpcEngineV2, ResultConstraint } from './JsonRpcEngineV2';
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
): LegacyMiddleware<Params, ResultConstraint<Request>> {
  const middleware = engine.asMiddleware();
  return createAsyncMiddleware(async (req, res, next) => {
    const request = fromLegacyRequest(req as Request);
    const context = makeContext(req);
    let modifiedRequest: Request | undefined;

    const result = await middleware({
      request,
      context,
      next: (finalRequest) => {
        modifiedRequest = finalRequest;
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
