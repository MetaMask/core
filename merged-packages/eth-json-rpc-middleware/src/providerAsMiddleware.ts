import { JsonRpcMiddleware, PendingJsonRpcResponse } from 'json-rpc-engine';
import type { SafeEventEmitterProvider } from '@metamask/eth-json-rpc-provider';

export function providerAsMiddleware(
  provider: SafeEventEmitterProvider,
): JsonRpcMiddleware<unknown, unknown> {
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
): JsonRpcMiddleware<unknown, unknown> {
  return (req, res, _next, end) => {
    // send request to provider
    provider.send(
      req,
      (err: unknown, providerRes: PendingJsonRpcResponse<any>) => {
        // forward any error
        if (err) {
          // TODO: Remove this cast when next major `json-rpc-engine` release is out
          // The next release changes how errors are propogated.
          return end(err as Error);
        }
        // copy provider response onto original response
        Object.assign(res, providerRes);
        return end();
      },
    );
  };
}
