import type {
  Json,
  JsonRpcParams,
  JsonRpcRequest,
  JsonRpcResponse,
} from '@metamask/utils';

import type { AbstractRpcService } from './abstract-rpc-service';
import { RpcService } from './rpc-service';
import type { FetchOptions } from './shared';

/**
 * The subset of options accepted by the RpcServiceChain constructor which
 * represent a single endpoint.
 */
type RpcServiceConfiguration = {
  /**
   * The URL of the endpoint.
   */
  endpointUrl: URL | string;
  /**
   * The options to pass to `fetch` when making the request to the endpoint.
   */
  fetchOptions?: FetchOptions;
};

/**
 * This class constructs a chain of RpcService objects which represent a
 * particular network. The first object in the chain is intended to be the primary
 * way of reaching the network and the remaining objects are used as failovers.
 */
export class RpcServiceChain implements AbstractRpcService {
  readonly #services: RpcService[];

  /**
   * Constructs a new RpcServiceChain object.
   *
   * @param args - The arguments.
   * @param args.fetch - A function that can be used to make an HTTP request.
   * If your JavaScript environment supports `fetch` natively, you'll probably
   * want to pass that; otherwise you can pass an equivalent (such as `fetch`
   * via `node-fetch`).
   * @param args.btoa - A function that can be used to convert a binary string
   * into base-64. Used to encode authorization credentials.
   * @param args.serviceConfigurations - The options for the RPC services that
   * you want to construct. This class takes a set of configuration objects and
   * not literal `RpcService`s to account for the possibility that we may want
   * to send request headers to official Infura endpoints and not failovers.
   */
  constructor({
    fetch: givenFetch,
    btoa: givenBtoa,
    serviceConfigurations,
  }: {
    fetch: typeof fetch;
    btoa: typeof btoa;
    serviceConfigurations: RpcServiceConfiguration[];
  }) {
    this.#services = this.#buildRpcServiceChain({
      serviceConfigurations,
      fetch: givenFetch,
      btoa: givenBtoa,
    });
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
   * @param args - The arguments.
   * @param args.serviceConfigurations - The options for the RPC services that
   * you want to construct.
   * @param args.fetch - A function that can be used to make an HTTP request.
   * @param args.btoa - A function that can be used to convert a binary string
   * into base-64. Used to encode authorization credentials.
   * @returns The constructed chain of RPC services.
   */
  #buildRpcServiceChain({
    serviceConfigurations,
    fetch: givenFetch,
    btoa: givenBtoa,
  }: {
    serviceConfigurations: RpcServiceConfiguration[];
    fetch: typeof fetch;
    btoa: typeof btoa;
  }): RpcService[] {
    return [...serviceConfigurations]
      .reverse()
      .reduce((workingServices: RpcService[], serviceConfiguration, index) => {
        const failoverService = index > 0 ? workingServices[0] : undefined;
        const service = new RpcService({
          fetch: givenFetch,
          btoa: givenBtoa,
          ...serviceConfiguration,
          failoverService,
        });
        return [service, ...workingServices];
      }, []);
  }
}
