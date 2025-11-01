import { asV2Middleware } from '@metamask/json-rpc-engine';
import type { JsonRpcMiddleware as LegacyJsonRpcMiddleware } from '@metamask/json-rpc-engine';
import { JsonRpcServer } from '@metamask/json-rpc-engine/v2';
import type { Json, JsonRpcParams } from '@metamask/utils';

import type { InternalProviderMiddleware } from './internal-provider';
import { InternalProvider } from './internal-provider';

/**
 * Construct an Ethereum provider from the given middleware.
 *
 * @param middleware - The middleware to construct a provider from.
 * @returns An Ethereum provider.
 * @deprecated Use {@link providerFromMiddlewareV2} instead.
 */
export function providerFromMiddleware<
  Params extends JsonRpcParams,
  Result extends Json,
>(middleware: LegacyJsonRpcMiddleware<Params, Result>): InternalProvider {
  return providerFromMiddlewareV2(
    asV2Middleware(middleware) as InternalProviderMiddleware,
  );
}

/**
 * Construct an Ethereum provider from the given middleware.
 *
 * @param middleware - The middleware to construct a provider from.
 * @returns An Ethereum provider.
 */
export function providerFromMiddlewareV2<
  Middleware extends InternalProviderMiddleware,
>(middleware: Middleware): InternalProvider {
  return new InternalProvider({
    server: new JsonRpcServer({ middleware: [middleware] }),
  });
}
