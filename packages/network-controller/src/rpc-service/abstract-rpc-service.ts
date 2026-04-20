import type { RpcServiceRequestable } from './rpc-service-requestable';

/**
 * The interface for a service class responsible for making a request to an RPC
 * endpoint or a group of RPC endpoints.
 *
 * @deprecated Don't use this interface (it will be removed in an upcoming major
 * version). If you need to take an "RPC-service-like" argument, it's best to
 * declare which properties you're interested in rather than accepting the
 * entire RPC service interface.
 */
export type AbstractRpcService = RpcServiceRequestable & {
  /**
   * The URL of the RPC endpoint.
   */
  endpointUrl: URL;
};
