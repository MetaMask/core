import type { ServicePolicy } from '@metamask/controller-utils';
import {
  CircuitState,
  createServicePolicy,
  handleWhen,
} from '@metamask/controller-utils';
import { rpcErrors } from '@metamask/rpc-errors';
import type { JsonRpcRequest } from '@metamask/utils';
import {
  hasProperty,
  type Json,
  type JsonRpcParams,
  type JsonRpcResponse,
} from '@metamask/utils';
import deepmerge from 'deepmerge';

import type { AbstractRpcService } from './abstract-rpc-service';
import type { FetchOptions } from './shared';

/**
 * The list of error messages that represent a failure to reach the network.
 *
 * This list was derived from Sindre Sorhus's `is-network-error` package:
 * <https://github.com/sindresorhus/is-network-error/blob/7bbfa8be9482ce1427a21fbff60e3ee1650dd091/index.js>
 */
export const NETWORK_UNREACHABLE_ERRORS = new Set([
  'network error', // Chrome
  'Failed to fetch', // Chrome
  'NetworkError when attempting to fetch resource.', // Firefox
  'The Internet connection appears to be offline.', // Safari 16
  'Load failed', // Safari 17+
  'Network request failed', // `cross-fetch`
  'fetch failed', // Undici (Node.js)
  'terminated', // Undici (Node.js)
]);

/**
 * Determines whether the given error represents a failure to reach the network
 * after request parameters have been validated.
 *
 * This is somewhat difficult to verify because JavaScript engines (and in
 * some cases libraries) produce slightly different error messages for this
 * particular scenario, and we need to account for this.
 *
 * @param error - The error.
 * @returns True if the error indicates that the network is unreachable, and
 * false otherwise.
 */
export default function isNetworkUnreachableError(error: unknown) {
  return (
    error instanceof TypeError && NETWORK_UNREACHABLE_ERRORS.has(error.message)
  );
}

/**
 * Guarantees a URL, even given a string. This is useful for checking components
 * of that URL.
 *
 * @param endpointUrlOrUrlString - Either a URL object or a string that
 * represents the URL of an endpoint.
 * @returns A URL object.
 */
function getNormalizedEndpointUrl(endpointUrlOrUrlString: URL | string): URL {
  return endpointUrlOrUrlString instanceof URL
    ? endpointUrlOrUrlString
    : new URL(endpointUrlOrUrlString);
}

/**
 * This class is responsible for making a request to an endpoint that implements
 * the JSON-RPC protocol. It is designed to gracefully handle network and server
 * failures, retrying requests using exponential backoff. It also offers a hook
 * which can used to respond to slow requests.
 */
export class RpcService implements AbstractRpcService {
  /**
   * The function used to make an HTTP request.
   */
  readonly #fetch: typeof fetch;

  /**
   * The URL of the RPC endpoint.
   */
  readonly #endpointUrl: URL;

  /**
   * A common set of options that the request options will extend.
   */
  readonly #fetchOptions: FetchOptions;

  /**
   * An RPC service that represents a failover endpoint which will be invoked
   * while the circuit for _this_ service is open.
   */
  readonly #failoverService: AbstractRpcService | undefined;

  /**
   * The policy that wraps the request.
   */
  readonly #policy: ServicePolicy;

  /**
   * Constructs a new RpcService object.
   *
   * @param args - The arguments.
   * @param args.fetch - A function that can be used to make an HTTP request.
   * If your JavaScript environment supports `fetch` natively, you'll probably
   * want to pass that; otherwise you can pass an equivalent (such as `fetch`
   * via `node-fetch`).
   * @param args.btoa - A function that can be used to encode a binary string
   * into base 64. Used to encode authorization credentials.
   * @param args.endpointUrl - The URL of the RPC endpoint.
   * @param args.fetchOptions - A common set of options that will be used to
   * make every request. Can be overridden on the request level (e.g. to add
   * headers).
   * @param args.failoverService - An RPC service that represents a failover
   * endpoint which will be invoked while the circuit for _this_ service is
   * open.
   */
  constructor({
    fetch: givenFetch,
    btoa: givenBtoa,
    endpointUrl,
    fetchOptions = {},
    failoverService,
  }: {
    fetch: typeof fetch;
    btoa: typeof btoa;
    endpointUrl: URL | string;
    fetchOptions?: FetchOptions;
    failoverService?: AbstractRpcService;
  }) {
    this.#fetch = givenFetch;
    this.#endpointUrl = getNormalizedEndpointUrl(endpointUrl);
    this.#fetchOptions = this.#getDefaultFetchOptions(
      this.#endpointUrl,
      fetchOptions,
      givenBtoa,
    );
    this.#failoverService = failoverService;

    const policy = createServicePolicy({
      maxRetries: 4,
      maxConsecutiveFailures: 15,
      retryFilterPolicy: handleWhen((error) => {
        return (
          // Ignore errors where the request failed to establish
          isNetworkUnreachableError(error) ||
          // Ignore server sent HTML error pages or truncated JSON responses
          error.message.includes('not valid JSON') ||
          // Ignore server overload errors
          error.message.includes('Gateway timeout') ||
          (hasProperty(error, 'code') &&
            (error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET'))
        );
      }),
    });
    this.#policy = policy;
  }

  /**
   * Listens for when the retry policy underlying this RPC service retries the
   * request.
   *
   * @param listener - The callback to be called when the retry occurs.
   * @returns What {@link ServicePolicy.onRetry} returns.
   * @see {@link createServicePolicy}
   */
  onRetry(listener: Parameters<ServicePolicy['onRetry']>[0]) {
    return this.#policy.onRetry(listener);
  }

  /**
   * Listens for when the circuit breaker policy underlying this RPC service
   * detects a broken circuit.
   *
   * @param listener - The callback to be called when the circuit is broken.
   * @returns What {@link ServicePolicy.onBreak} returns.
   * @see {@link createServicePolicy}
   */
  onBreak(listener: Parameters<ServicePolicy['onBreak']>[0]) {
    return this.#policy.onBreak(listener);
  }

  /**
   * Listens for when the policy underlying this RPC service detects a slow
   * request.
   *
   * @param listener - The callback to be called when the request is slow.
   * @returns What {@link ServicePolicy.onDegraded} returns.
   * @see {@link createServicePolicy}
   */
  onDegraded(listener: Parameters<ServicePolicy['onDegraded']>[0]) {
    return this.#policy.onDegraded(listener);
  }

  /**
   * Makes a request to the RPC endpoint. If the circuit is open because this
   * request has failed too many times, the request is forwarded to a failover
   * service (if provided).
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
   * Makes a request to the RPC endpoint. If the circuit is open because this
   * request has failed too many times, the request is forwarded to a failover
   * service (if provided).
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
    const completeFetchOptions = this.#getCompleteFetchOptions(
      jsonRpcRequest,
      fetchOptions,
    );

    try {
      return await this.#executePolicy<Params, Result>(
        jsonRpcRequest,
        completeFetchOptions,
      );
    } catch (error) {
      if (
        this.#policy.circuitBreakerPolicy.state === CircuitState.Open &&
        this.#failoverService !== undefined
      ) {
        return await this.#failoverService.request(
          jsonRpcRequest,
          completeFetchOptions,
        );
      }
      throw error;
    }
  }

  /**
   * Constructs a default set of options to `fetch`.
   *
   * If a username and password are present in the URL, they are extracted to an
   * Authorization header.
   *
   * @param endpointUrl - The endpoint URL.
   * @param fetchOptions - The options to `fetch`.
   * @param givenBtoa - An implementation of `btoa`.
   * @returns The default fetch options.
   */
  #getDefaultFetchOptions(
    endpointUrl: URL,
    fetchOptions: FetchOptions,
    givenBtoa: (stringToEncode: string) => string,
  ): FetchOptions {
    if (endpointUrl.username && endpointUrl.password) {
      const authString = `${endpointUrl.username}:${endpointUrl.password}`;
      const encodedCredentials = givenBtoa(authString);
      return deepmerge(fetchOptions, {
        headers: { Authorization: `Basic ${encodedCredentials}` },
      });
    }

    return fetchOptions;
  }

  /**
   * Constructs a final set of options to pass to `fetch`. Note that the method
   * defaults to `post`, and the JSON-RPC request is automatically JSON-encoded.
   *
   * @param jsonRpcRequest - The JSON-RPC request.
   * @param fetchOptions - Custom `fetch` options.
   * @returns The complete set of `fetch` options.
   */
  #getCompleteFetchOptions<Params extends JsonRpcParams>(
    jsonRpcRequest: JsonRpcRequest<Params>,
    fetchOptions: FetchOptions,
  ): FetchOptions {
    const defaultOptions = {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    };
    const mergedOptions = deepmerge(
      defaultOptions,
      deepmerge(this.#fetchOptions, fetchOptions),
    );

    const { id, jsonrpc, method, params } = jsonRpcRequest;
    const body = JSON.stringify({
      id,
      jsonrpc,
      method,
      params,
    });

    return { ...mergedOptions, body };
  }

  /**
   * Makes the request using the Cockatiel policy that this service creates.
   *
   * @param jsonRpcRequest - The JSON-RPC request to send to the endpoint.
   * @param fetchOptions - The options for `fetch`; will be combined with the
   * fetch options passed to the constructor
   * @returns The decoded JSON-RPC response from the endpoint.
   * @throws A "method not found" error if the response status is 405.
   * @throws A rate limiting error if the response HTTP status is 429.
   * @throws A timeout error if the response HTTP status is 503 or 504.
   * @throws A generic error if the response HTTP status is not 2xx but also not
   * 405, 429, 503, or 504.
   */
  async #executePolicy<
    Params extends JsonRpcParams,
    Result extends Json,
    Request extends JsonRpcRequest = JsonRpcRequest<Params>,
  >(
    jsonRpcRequest: Request,
    fetchOptions: FetchOptions,
  ): Promise<JsonRpcResponse<Result> | JsonRpcResponse<null>> {
    return await this.#policy.execute(async () => {
      const response = await this.#fetch(this.#endpointUrl, fetchOptions);

      if (response.status === 405) {
        throw rpcErrors.methodNotFound();
      }

      if (response.status === 429) {
        throw rpcErrors.internal({ message: 'Request is being rate limited.' });
      }

      if (response.status === 503 || response.status === 504) {
        throw rpcErrors.internal({
          message:
            'Gateway timeout. The request took too long to process. This can happen when querying logs over too wide a block range.',
        });
      }

      const text = await response.text();

      if (
        jsonRpcRequest.method === 'eth_getBlockByNumber' &&
        text === 'Not Found'
      ) {
        return {
          id: jsonRpcRequest.id,
          jsonrpc: jsonRpcRequest.jsonrpc,
          result: null,
        };
      }

      // Type annotation: We assume that if this response is valid JSON, it's a
      // valid JSON-RPC response.
      let json: JsonRpcResponse<Result>;
      try {
        json = JSON.parse(text);
      } catch (error) {
        if (error instanceof SyntaxError) {
          throw rpcErrors.internal({
            message: 'Could not parse response as it is not valid JSON',
            data: text,
          });
        } else {
          throw error;
        }
      }

      if (!response.ok) {
        throw rpcErrors.internal({
          message: `Non-200 status code: '${response.status}'`,
          data: json,
        });
      }

      return json;
    });
  }
}
