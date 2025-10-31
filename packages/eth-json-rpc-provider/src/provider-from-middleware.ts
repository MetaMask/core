import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import type { JsonRpcMiddleware as LegacyJsonRpcMiddleware } from '@metamask/json-rpc-engine';
import { JsonRpcServer } from '@metamask/json-rpc-engine/v2';
import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine/v2';
import type { Json, JsonRpcParams, JsonRpcRequest } from '@metamask/utils';

import { InternalProvider } from './internal-provider';
import { providerFromEngine } from './provider-from-engine';

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
  const engine: JsonRpcEngine = new JsonRpcEngine();
  engine.push(middleware);
  const provider: InternalProvider = providerFromEngine(engine);
  return provider;
}

/**
 * Construct an Ethereum provider from the given middleware.
 *
 * @param middleware - The middleware to construct a provider from.
 * @returns An Ethereum provider.
 */
export function providerFromMiddlewareV2<
  Middleware extends JsonRpcMiddleware<JsonRpcRequest, Json>,
>(middleware: Middleware): InternalProvider {
  return new InternalProvider({
    rpcHandler: new JsonRpcServer({ middleware: [middleware] }),
  });
}
