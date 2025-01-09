import type { ServicePolicy } from '@metamask/controller-utils';
import type { Json } from '@metamask/utils';

/**
 * The interface for a service class responsible for making a request to an RPC
 * endpoint.
 */
export type AbstractRpcService = Partial<
  Pick<ServicePolicy, 'onBreak' | 'onRetry' | 'onDegraded'>
> & {
  request(options?: RequestInit): Promise<Json>;
};
