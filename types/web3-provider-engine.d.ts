declare module 'web3-provider-engine' {
  import type { EventEmitter } from 'events';
  import type { PollingBlockTracker } from 'eth-block-tracker';

  type RpcPayload<P> = {
    id: unknown;
    jsonrpc: unknown;
    method: unknown;
    params?: P;
  };

  type RpcResponse<Y extends RpcPayload<any>, V> = {
    id: Y['id'];
    jsonrpc: Y['jsonrpc'];
    result: V | undefined;
    error?: {
      message: any;
      code?: number;
    };
  };

  type SendAsyncCallback<Y extends RpcPayload<any>, V> = (
    error: unknown,
    response: RpcResponse<Y, V>,
  ) => void;

  export type Provider = {
    sendAsync: <P, V>(
      payload: RpcPayload<P> | RpcPayload<P>[],
      callback: SendAsyncCallback<RpcPayload<P>, V>,
    ) => void;
  };

  export type ProviderEngine = EventEmitter &
    Provider & {
      _blockTracker: PollingBlockTracker;
      stop: () => void;
    };
}
