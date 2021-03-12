import {
  JsonRpcEngine,
  JsonRpcRequest,
} from 'json-rpc-engine';
import SafeEventEmitter from '@metamask/safe-event-emitter';
import {
  SafeEventEmitterProvider,
} from './cache-utils';

export = providerFromEngine;

function providerFromEngine(engine: JsonRpcEngine): SafeEventEmitterProvider {
  const provider: SafeEventEmitterProvider = (new SafeEventEmitter() as SafeEventEmitterProvider);
  // handle both rpc send methods
  provider.sendAsync = engine.handle.bind(engine);
  provider.send = (req: JsonRpcRequest<string[]>, callback: VoidFunction) => {
    if (!callback) {
      throw new Error('Web3 Provider - must provider callback to "send" method');
    }
    engine.handle(req, callback);
  };
  // forward notifications
  if (engine.on) {
    engine.on('notification', (message: string) => {
      provider.emit('data', null, message);
    });
  }
  return provider;

}
