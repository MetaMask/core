import type { Json, JsonRpcParams, JsonRpcRequest } from '@metamask/utils';

import {
  deepClone,
  fromLegacyRequest,
  makeContext,
  propagateToRequest,
} from './compatibility-utils';
import type { JsonRpcEngineV2 } from './JsonRpcEngineV2';
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
  Result extends Json,
>(engine: JsonRpcEngineV2<Request, Result>): LegacyMiddleware<Params, Result> {
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
        return Promise.resolve();
      },
    });

    if (modifiedRequest !== undefined && modifiedRequest !== request) {
      Object.assign(req, deepClone(modifiedRequest));
    }
    propagateToRequest(req, context);

    if (result !== undefined) {
      res.result = result;
      return undefined;
    }
    return next();
  });
}
