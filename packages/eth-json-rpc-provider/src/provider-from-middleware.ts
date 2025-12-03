import { asV2Middleware } from '@metamask/json-rpc-engine';
import type { JsonRpcMiddleware as LegacyJsonRpcMiddleware } from '@metamask/json-rpc-engine';
import { JsonRpcEngineV2 } from '@metamask/json-rpc-engine/v2';
import type {
  JsonRpcMiddleware,
  ResultConstraint,
} from '@metamask/json-rpc-engine/v2';
import type { ContextConstraint } from '@metamask/json-rpc-engine/v2';
import type { Json, JsonRpcParams, JsonRpcRequest } from '@metamask/utils';

import { InternalProvider } from './internal-provider';

/**
 * Construct an Ethereum provider from the given middleware.
 *
 * @param middleware - The middleware to construct a provider from.
 * @returns An Ethereum provider.
 * @deprecated Use `JsonRpcEngineV2` middleware and {@link providerFromMiddlewareV2} instead.
 */
export function providerFromMiddleware<
  Params extends JsonRpcParams,
  Result extends Json,
>(middleware: LegacyJsonRpcMiddleware<Params, Result>): InternalProvider {
  return providerFromMiddlewareV2(
    // This function is generic on the Params and Result types to match the legacy JsonRpcMiddleware type.
    // However, since the V2 JsonRpcMiddleware type is not generic on the Params, we need to elide this
    // parameter by upcasting the request type to JsonRpcRequest, or we get an error due to contravariance
    // since JsonRpcRequest<Params> is not assignable to JsonRpcRequest.
    asV2Middleware(middleware) as JsonRpcMiddleware<JsonRpcRequest>,
  );
}

/**
 * Construct an Ethereum provider from the given middleware.
 *
 * @param middleware - The middleware to construct a provider from.
 * @returns An Ethereum provider.
 */
export function providerFromMiddlewareV2<
  Request extends JsonRpcRequest,
  Middleware extends JsonRpcMiddleware<
    Request,
    ResultConstraint<Request>,
    ContextConstraint
  >,
>(middleware: Middleware): InternalProvider {
  return new InternalProvider({
    engine: JsonRpcEngineV2.create({
      // This function is generic in order to accept middleware functions with narrower types than
      // the plain JsonRpcMiddleware<JsonRpcRequest> type. However, since InternalProvider is non-generic,
      // we need to upcast the middleware to avoid a type error.
      middleware: [middleware as JsonRpcMiddleware<JsonRpcRequest>],
    }),
  });
}
