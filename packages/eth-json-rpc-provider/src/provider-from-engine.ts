import type { JsonRpcEngine } from '@metamask/json-rpc-engine';

import { InternalProvider } from './internal-provider';

/**
 * Construct an Ethereum provider from the given JSON-RPC engine.
 *
 * @param engine - The JSON-RPC engine to construct a provider from.
 * @returns An Ethereum provider.
 */
export function providerFromEngine(engine: JsonRpcEngine): InternalProvider {
  return new InternalProvider({ engine });
}
