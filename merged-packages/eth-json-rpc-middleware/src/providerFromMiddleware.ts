import { JsonRpcEngine, JsonRpcMiddleware } from 'json-rpc-engine';
import { SafeEventEmitterProvider, Block } from './utils/cache';
import { providerFromEngine } from './providerFromEngine';

export function providerFromMiddleware(
  middleware: JsonRpcMiddleware<string[], Block>,
): SafeEventEmitterProvider {
  const engine: JsonRpcEngine = new JsonRpcEngine();
  engine.push(middleware);
  const provider: SafeEventEmitterProvider = providerFromEngine(engine);
  return provider;
}
