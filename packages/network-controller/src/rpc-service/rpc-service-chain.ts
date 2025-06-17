import type {
  Json,
  JsonRpcParams,
  JsonRpcRequest,
  JsonRpcResponse,
} from '@metamask/utils';

import { RpcService } from './rpc-service';
import type { RpcServiceOptions } from './rpc-service';
import type { RpcServiceRequestable } from './rpc-service-requestable';
import type { FetchOptions } from './shared';

/**
 * This class constructs a chain of RpcService objects which represent a
 * particular network. The first object in the chain is intended to be the
 * primary way of reaching the network and the remaining objects are used as
 * failovers.
 */
export class RpcServiceChain implements RpcServiceRequestable {
  readonly #services: RpcService[];

  /**
   * Constructs a new RpcServiceChain object.
   *
   * @param rpcServiceConfigurations - The options for the RPC services
   * that you want to construct. Each object in this array is the same as
   * {@link RpcServiceOptions}.
   */
  constructor(
    rpcServiceConfigurations: Omit<RpcServiceOptions, 'failoverService'>[],
  ) {
    this.#services = this.#buildRpcServiceChain(rpcServiceConfigurations);
  }

  /**
   * Listens for when any of the RPC services retry a request.
   *
   * @param listener - The callback to be called when the retry occurs.
   * @returns What {@link RpcService.onRetry} returns.
   */
  onRetry(listener: Parameters<RpcService['onRetry']>[0]) {
    const disposables = this.#services.map((service) =>
      service.onRetry(listener),
    );

    return {
      dispose() {
        disposables.forEach((disposable) => disposable.dispose());
      },
    };
  }

  /**
   * Listens for when any of the RPC services retry the request too many times
   * in a row.
   *
   * @param listener - The callback to be called when the retry occurs.
   * @returns What {@link RpcService.onBreak} returns.
   */
  onBreak(listener: Parameters<RpcService['onBreak']>[0]) {
    const disposables = this.#services.map((service) =>
      service.onBreak(listener),
    );

    return {
      dispose() {
        disposables.forEach((disposable) => disposable.dispose());
      },
    };
  }

  /**
   * Listens for when any of the RPC services send a slow request.
   *
   * @param listener - The callback to be called when the retry occurs.
   * @returns What {@link RpcService.onRetry} returns.
   */
  onDegraded(listener: Parameters<RpcService['onDegraded']>[0]) {
    const disposables = this.#services.map((service) =>
      service.onDegraded(listener),
    );

    return {
      dispose() {
        disposables.forEach((disposable) => disposable.dispose());
      },
    };
  }

  /**
   * Makes a request to the first RPC service in the chain. If this service is
   * down, then the request is forwarded to the next service in the chain, etc.
   *
   * This overload is specifically designed for `eth_getBlockByNumber`, which
   * can return a `result` of `null` despite an expected `Result` being
   * provided.
   *
   * @param jsonRpcRequest - The JSON-RPC request to send to the endpoint.
   * @param fetchOptions - An options bag for {@link fetch} which further
   * specifies the request.
   * @returns The decoded JSON-RPC response from the endpoint.
   * @throws A "method not found" error if the response status is 405.
   * @throws A rate limiting error if the response HTTP status is 429.
   * @throws A timeout error if the response HTTP status is 503 or 504.
   * @throws A generic error if the response HTTP status is not 2xx but also not
   * 405, 429, 503, or 504.
   */
  async request<Params extends JsonRpcParams, Result extends Json>(
    jsonRpcRequest: JsonRpcRequest<Params> & { method: 'eth_getBlockByNumber' },
    fetchOptions?: FetchOptions,
  ): Promise<JsonRpcResponse<Result> | JsonRpcResponse<null>>;

  /**
   * Makes a request to the first RPC service in the chain. If this service is
   * down, then the request is forwarded to the next service in the chain, etc.
   *
   * This overload is designed for all RPC methods except for
   * `eth_getBlockByNumber`, which are expected to return a `result` of the
   * expected `Result`.
   *
   * @param jsonRpcRequest - The JSON-RPC request to send to the endpoint.
   * @param fetchOptions - An options bag for {@link fetch} which further
   * specifies the request.
   * @returns The decoded JSON-RPC response from the endpoint.
   * @throws A "method not found" error if the response status is 405.
   * @throws A rate limiting error if the response HTTP status is 429.
   * @throws A timeout error if the response HTTP status is 503 or 504.
   * @throws A generic error if the response HTTP status is not 2xx but also not
   * 405, 429, 503, or 504.
   */
  async request<Params extends JsonRpcParams, Result extends Json>(
    jsonRpcRequest: JsonRpcRequest<Params>,
    fetchOptions?: FetchOptions,
  ): Promise<JsonRpcResponse<Result>>;

  async request<Params extends JsonRpcParams, Result extends Json>(
    jsonRpcRequest: JsonRpcRequest<Params>,
    fetchOptions: FetchOptions = {},
  ): Promise<JsonRpcResponse<Result | null>> {
    return this.#services[0].request(jsonRpcRequest, fetchOptions);
  }

  /**
   * Constructs the chain of RPC services. The second RPC service is
   * configured as the failover for the first, the third service is
   * configured as the failover for the second, etc.
   *
   * @param rpcServiceConfigurations - The options for the RPC services that
   * you want to construct. Each object in this array is the same as
   * {@link RpcServiceOptions}.
   * @returns The constructed chain of RPC services.
   */
  #buildRpcServiceChain(
    rpcServiceConfigurations: Omit<RpcServiceOptions, 'failoverService'>[],
  ): RpcService[] {
    return [...rpcServiceConfigurations]
      .reverse()
      .reduce((workingServices: RpcService[], serviceConfiguration, index) => {
        const failoverService = index > 0 ? workingServices[0] : undefined;
        const service = new RpcService({
          ...serviceConfiguration,
          failoverService,
        });
        return [service, ...workingServices];
      }, []);
  }
}
