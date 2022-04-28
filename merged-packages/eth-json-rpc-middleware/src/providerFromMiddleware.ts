import { JsonRpcEngine, JsonRpcMiddleware } from 'json-rpc-engine';
import type { SafeEventEmitterProvider, Block } from './types';
import { providerFromEngine } from './providerFromEngine';

export function providerFromMiddleware(
  middleware: JsonRpcMiddleware<string[], Block>,
): SafeEventEmitterProvider {
  const engine: JsonRpcEngine = new JsonRpcEngine();
  engine.push(middleware);
  const provider: SafeEventEmitterProvider = providerFromEngine(engine);
  return provider;
}
