import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine';
import type { Json, JsonRpcParams } from '@metamask/utils';

import type { InternalProvider } from './internal-provider';
import { providerFromEngine } from './provider-from-engine';

/**
 * Construct an Ethereum provider from the given middleware.
 *
 * @param middleware - The middleware to construct a provider from.
 * @returns An Ethereum provider.
 */
export function providerFromMiddleware<
  Params extends JsonRpcParams,
  Result extends Json,
>(middleware: JsonRpcMiddleware<Params, Result>): InternalProvider {
  const engine: JsonRpcEngine = new JsonRpcEngine();
  engine.push(middleware);
  const provider: InternalProvider = providerFromEngine(engine);
  return provider;
}
