import { JsonRpcEngine } from 'json-rpc-engine';
import type { JsonRpcMiddleware } from 'json-rpc-engine';

import { providerFromEngine } from './provider-from-engine';
import type { SafeEventEmitterProvider } from './safe-event-emitter-provider';

/**
 * Construct an Ethereum provider from the given middleware.
 *
 * @param middleware - The middleware to construct a provider from.
 * @returns An Ethereum provider.
 */
export function providerFromMiddleware(
  middleware: JsonRpcMiddleware<unknown, unknown>,
): SafeEventEmitterProvider {
  const engine: JsonRpcEngine = new JsonRpcEngine();
  engine.push(middleware);
  const provider: SafeEventEmitterProvider = providerFromEngine(engine);
  return provider;
}
