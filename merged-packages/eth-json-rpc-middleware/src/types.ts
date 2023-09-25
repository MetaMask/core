import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine';
import type { Json, JsonRpcParams, JsonRpcRequest } from '@metamask/utils';

export interface JsonRpcRequestToCache<Params extends JsonRpcParams>
  extends JsonRpcRequest<Params> {
  skipCache?: boolean;
}

export type JsonRpcCacheMiddleware<
  Params extends JsonRpcParams,
  Result extends Json,
> = JsonRpcMiddleware<Params, Result> extends (
  req: JsonRpcRequest<Params>,
  ...args: infer X
) => infer Y
  ? (req: JsonRpcRequestToCache<Params>, ...args: X) => Y
  : never;

export type BlockData = string | string[];

export type Block = Record<string, BlockData>;

export type BlockCache = Record<string, Block>;

export type Cache = Record<number, BlockCache>;
