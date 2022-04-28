import { JsonRpcMiddleware, PendingJsonRpcResponse } from 'json-rpc-engine';
import type { Block, SafeEventEmitterProvider } from './types';

export function providerAsMiddleware(
  provider: SafeEventEmitterProvider,
): JsonRpcMiddleware<string[], Block> {
  return (req, res, _next, end) => {
    // send request to provider
    provider.sendAsync(
      req,
      (err: unknown, providerRes: PendingJsonRpcResponse<any>) => {
        // forward any error
        if (err instanceof Error) {
          return end(err);
        }
        // copy provider response onto original response
        Object.assign(res, providerRes);
        return end();
      },
    );
  };
}

export function ethersProviderAsMiddleware(
  provider: SafeEventEmitterProvider,
): JsonRpcMiddleware<string[], Block> {
  return (req, res, _next, end) => {
    // send request to provider
    provider.send(
      req,
      (err: Error, providerRes: PendingJsonRpcResponse<any>) => {
        // forward any error
        if (err) {
          return end(err);
        }
        // copy provider response onto original response
        Object.assign(res, providerRes);
        return end();
      },
    );
  };
}
