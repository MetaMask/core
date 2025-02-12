import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine';
import type {
  Json,
  JsonRpcParams,
  JsonRpcRequest,
  JsonRpcResponse,
} from '@metamask/utils';

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

/**
 * The interface for a service class responsible for making a request to an RPC
 * endpoint.
 */
export type AbstractRpcService = {
  /**
   * Listens for when the RPC service retries the request.
   *
   * @param listener - The callback to be called when the retry occurs.
   * @returns A disposable.
   */
  onRetry: (
    listener: (
      data: ({ error: Error } | { value: unknown }) & {
        delay: number;
        attempt: number;
        endpointUrl: string;
      },
    ) => void,
  ) => {
    dispose(): void;
  };

  /**
   * Listens for when the RPC service retries the request too many times in a
   * row.
   *
   * @param listener - The callback to be called when the circuit is broken.
   * @returns A disposable.
   */
  onBreak: (
    listener: (
      data: ({ error: Error } | { value: unknown } | { isolated: true }) & {
        endpointUrl: string;
      },
    ) => void,
  ) => {
    dispose(): void;
  };

  /**
   * Listens for when the policy underlying this RPC service detects a slow
   * request.
   *
   * @param listener - The callback to be called when the request is slow.
   * @returns A disposable.
   */
  onDegraded: (listener: (data: { endpointUrl: string }) => void) => {
    dispose(): void;
  };

  /**
   * Makes a request to the RPC endpoint.
   */
  request<Params extends JsonRpcParams, Result extends Json>(
    jsonRpcRequest: JsonRpcRequest<Params>,
    fetchOptions?: RequestInit,
  ): Promise<JsonRpcResponse<Result | null>>;
};
