import type { JsonRpcMiddleware, JsonRpcRequest } from 'json-rpc-engine';

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
