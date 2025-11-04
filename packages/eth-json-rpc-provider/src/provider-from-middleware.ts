import { asV2Middleware } from '@metamask/json-rpc-engine';
import type { JsonRpcMiddleware as LegacyJsonRpcMiddleware } from '@metamask/json-rpc-engine';
import type {
  JsonRpcMiddleware,
  ResultConstraint,
} from '@metamask/json-rpc-engine/v2';
import {
  JsonRpcEngineV2,
  type ContextConstraint,
} from '@metamask/json-rpc-engine/v2';
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
      middleware: [middleware as JsonRpcMiddleware<JsonRpcRequest>],
    }),
  });
}
