import {
  JsonRpcEngine,
  JsonRpcMiddleware,
} from 'json-rpc-engine';
import {
  SafeEventEmitterProvider,
  Block,
} from './cache-utils';
import providerFromEngine from './providerFromEngine';

export = providerFromMiddleware;

function providerFromMiddleware(middleware: JsonRpcMiddleware<string[], Block>): SafeEventEmitterProvider {
  const engine: JsonRpcEngine = new JsonRpcEngine();
  engine.push(middleware);
  const provider: SafeEventEmitterProvider = providerFromEngine(engine);
  return provider;
}
