import {
  JsonRpcMiddleware,
  PendingJsonRpcResponse,
} from 'json-rpc-engine';
import {
  Block,
  SafeEventEmitterProvider,
} from './cache-utils';

export = providerAsMiddleware;

function providerAsMiddleware(provider: SafeEventEmitterProvider): JsonRpcMiddleware<string[], Block> {
  return (req, res, _next, end) => {
    // send request to provider
    provider.sendAsync(req, (err: Error, providerRes: PendingJsonRpcResponse<Block>) => {
      // forward any error
      if (err) {
        return end(err);
      }
      // copy provider response onto original response
      Object.assign(res, providerRes);
      return end();
    });
  };
}
