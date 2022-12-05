import SafeEventEmitter from '@metamask/safe-event-emitter';
import { JsonRpcRequest, JsonRpcResponse } from 'json-rpc-engine';

// This type should be compatible with the one defined in
// `eth-json-rpc-middleware`.
export interface Provider extends SafeEventEmitter {
  sendAsync: <T, U>(
    req: JsonRpcRequest<T>,
    cb: (err: unknown, response: JsonRpcResponse<U>) => void,
  ) => void;
}
