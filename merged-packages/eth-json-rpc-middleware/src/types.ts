import {
  JsonRpcMiddleware,
  JsonRpcRequest,
  JsonRpcResponse,
} from 'json-rpc-engine';
import SafeEventEmitter from '@metamask/safe-event-emitter';

export type Payload = Partial<JsonRpcRequest<any[]>>;

export interface JsonRpcRequestToCache<T> extends JsonRpcRequest<T> {
  skipCache?: boolean;
}

export type JsonRpcCacheMiddleware<T, U> = JsonRpcMiddleware<T, U> extends (
  req: JsonRpcRequest<T>,
  ...args: infer X
) => infer Y
  ? (req: JsonRpcRequestToCache<T>, ...args: X) => Y
  : never;

export type BlockData = string | string[];

export type Block = Record<string, BlockData>;

export type BlockCache = Record<string, Block>;

export type Cache = Record<number, BlockCache>;

export type SendAsyncCallBack<T> = (
  err: unknown,
  providerRes: JsonRpcResponse<T>,
) => void;

export type SendCallBack = (
  err: any,
  providerRes: JsonRpcResponse<any>,
) => void;

export interface SafeEventEmitterProvider extends SafeEventEmitter {
  sendAsync: <T, U>(req: JsonRpcRequest<T>, cb: SendAsyncCallBack<U>) => void;
  send: (req: JsonRpcRequest<any>, callback: SendCallBack) => void;
}
