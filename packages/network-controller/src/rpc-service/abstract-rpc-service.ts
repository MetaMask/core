import type { ServicePolicy } from '@metamask/controller-utils';
import type {
  Json,
  JsonRpcParams,
  JsonRpcRequest,
  JsonRpcResponse,
} from '@metamask/utils';

import type { FetchOptions } from './shared';

/**
 * The interface for a service class responsible for making a request to an RPC
 * endpoint.
 */
export type AbstractRpcService = Partial<
  Pick<ServicePolicy, 'onBreak' | 'onRetry' | 'onDegraded'>
> & {
  request<Params extends JsonRpcParams, Result extends Json>(
    jsonRpcRequest: JsonRpcRequest<Params>,
    fetchOptions?: FetchOptions,
  ): Promise<JsonRpcResponse<Result | null>>;
};
