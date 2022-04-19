import { JsonRpcEngine, JsonRpcRequest } from 'json-rpc-engine';
import SafeEventEmitter from '@metamask/safe-event-emitter';
import { SafeEventEmitterProvider } from './utils/cache';

export function providerFromEngine(
  engine: JsonRpcEngine,
): SafeEventEmitterProvider {
  const provider: SafeEventEmitterProvider =
    new SafeEventEmitter() as SafeEventEmitterProvider;
  // handle both rpc send methods
  provider.sendAsync = (req, cb) => {
    engine.handle(req, cb);
  };

  provider.send = (
    req: JsonRpcRequest<any>,
    callback: (error: any, providerRes: any) => void,
  ) => {
    if (typeof callback !== 'function') {
      throw new Error('Must provide callback to "send" method.');
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
