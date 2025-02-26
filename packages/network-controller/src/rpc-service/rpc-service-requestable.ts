import type { ServicePolicy } from '@metamask/controller-utils';
import type {
  Json,
  JsonRpcParams,
  JsonRpcRequest,
  JsonRpcResponse,
} from '@metamask/utils';

import type { AddToCockatielEventData, FetchOptions } from './shared';

/**
 * The interface for a service class responsible for making a request to a
 * target, whether that is a single RPC endpoint or an RPC endpoint in an RPC
 * service chain.
 */
export type RpcServiceRequestable = {
  /**
   * Listens for when the RPC service retries the request.
   *
   * @param listener - The callback to be called when the retry occurs.
   * @returns What {@link ServicePolicy.onRetry} returns.
   * @see {@link createServicePolicy}
   */
  onRetry(
    listener: AddToCockatielEventData<
      Parameters<ServicePolicy['onRetry']>[0],
      { endpointUrl: string }
    >,
  ): ReturnType<ServicePolicy['onRetry']>;

  /**
   * Listens for when the RPC service retries the request too many times in a
   * row.
   *
   * @param listener - The callback to be called when the circuit is broken.
   * @returns What {@link ServicePolicy.onBreak} returns.
   * @see {@link createServicePolicy}
   */
  onBreak(
    listener: AddToCockatielEventData<
      Parameters<ServicePolicy['onBreak']>[0],
      { endpointUrl: string }
    >,
  ): ReturnType<ServicePolicy['onBreak']>;

  /**
   * Listens for when the policy underlying this RPC service detects a slow
   * request.
   *
   * @param listener - The callback to be called when the request is slow.
   * @returns What {@link ServicePolicy.onDegraded} returns.
   * @see {@link createServicePolicy}
   */
  onDegraded(
    listener: AddToCockatielEventData<
      Parameters<ServicePolicy['onDegraded']>[0],
      { endpointUrl: string }
    >,
  ): ReturnType<ServicePolicy['onDegraded']>;

  /**
   * Makes a request to the target.
   */
  request<Params extends JsonRpcParams, Result extends Json>(
    jsonRpcRequest: JsonRpcRequest<Params>,
    fetchOptions?: FetchOptions,
  ): Promise<JsonRpcResponse<Result | null>>;
};
