import type { SafeEventEmitterProvider } from '@metamask/eth-json-rpc-provider';
import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine';
import type {
  Json,
  JsonRpcParams,
  PendingJsonRpcResponse,
} from '@metamask/utils';

export function providerAsMiddleware(
  provider: SafeEventEmitterProvider,
): JsonRpcMiddleware<JsonRpcParams, Json> {
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
): JsonRpcMiddleware<JsonRpcParams, Json> {
  return (req, res, _next, end) => {
    // send request to provider
    provider.send(
      req,
      (err: unknown, providerRes: PendingJsonRpcResponse<any>) => {
        // forward any error
        if (err) {
          // TODO: Remove this cast when next major `@metamask/json-rpc-engine` release is out
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
