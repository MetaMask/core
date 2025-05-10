import type {
  CreateServicePolicyOptions,
  ServicePolicy,
} from '@metamask/controller-utils';
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
import type { AddToCockatielEventData, FetchOptions } from './shared';

/**
 * Options for the RpcService constructor.
 */
export type RpcServiceOptions = {
  /**
   * A function that can be used to convert a binary string into a
   * base64-encoded ASCII string. Used to encode authorization credentials.
   */
  btoa: typeof btoa;
  /**
   * The URL of the RPC endpoint to hit.
   */
  endpointUrl: URL | string;
  /**
   * An RPC service that represents a failover endpoint which will be invoked
   * while the circuit for _this_ service is open.
   */
  failoverService?: AbstractRpcService;
  /**
   * A function that can be used to make an HTTP request. If your JavaScript
   * environment supports `fetch` natively, you'll probably want to pass that;
   * otherwise you can pass an equivalent (such as `fetch` via `node-fetch`).
   */
  fetch: typeof fetch;
  /**
   * A common set of options that will be used to make every request. Can be
   * overridden on the request level (e.g. to add headers).
   */
  fetchOptions?: FetchOptions;
  /**
   * Options to pass to `createServicePolicy`. Note that `retryFilterPolicy` is
   * not accepted, as it is overwritten. See {@link createServicePolicy}.
   */
  policyOptions?: Omit<CreateServicePolicyOptions, 'retryFilterPolicy'>;
};

/**
 * The maximum number of times that a failing service should be re-run before
 * giving up.
 */
export const DEFAULT_MAX_RETRIES = 4;

/**
 * The maximum number of times that the service is allowed to fail before
 * pausing further retries. This is set to a value such that if given a
 * service that continually fails, the policy needs to be executed 3 times
 * before further retries are paused.
 */
export const DEFAULT_MAX_CONSECUTIVE_FAILURES = (1 + DEFAULT_MAX_RETRIES) * 3;

/**
 * The list of error messages that represent a failure to connect to the network.
 *
 * This list was derived from Sindre Sorhus's `is-network-error` package:
 * <https://github.com/sindresorhus/is-network-error/blob/7bbfa8be9482ce1427a21fbff60e3ee1650dd091/index.js>
 */
export const CONNECTION_ERRORS = [
  // Chrome
  {
    constructorName: 'TypeError',
    pattern: /network error/u,
  },
  // Chrome
  {
    constructorName: 'TypeError',
    pattern: /Failed to fetch/u,
  },
  // Firefox
  {
    constructorName: 'TypeError',
    pattern: /NetworkError when attempting to fetch resource\./u,
  },
  // Safari 16
  {
    constructorName: 'TypeError',
    pattern: /The Internet connection appears to be offline\./u,
  },
  // Safari 17+
  {
    constructorName: 'TypeError',
    pattern: /Load failed/u,
  },
  // `cross-fetch`
  {
    constructorName: 'TypeError',
    pattern: /Network request failed/u,
  },
  // `node-fetch`
  {
    constructorName: 'FetchError',
    pattern: /request to (.+) failed/u,
  },
  // Undici (Node.js)
  {
    constructorName: 'TypeError',
    pattern: /fetch failed/u,
  },
  // Undici (Node.js)
  {
    constructorName: 'TypeError',
    pattern: /terminated/u,
  },
];

/**
 * Determines whether the given error represents a failure to reach the network
 * after request parameters have been validated.
 *
 * This is somewhat difficult to verify because JavaScript engines (and in
 * some cases libraries) produce slightly different error messages for this
 * particular scenario, and we need to account for this.
 *
 * @param error - The error.
 * @returns True if the error indicates that the network cannot be connected to,
 * and false otherwise.
 */
export function isConnectionError(error: unknown) {
  if (!(typeof error === 'object' && error !== null && 'message' in error)) {
    return false;
  }

  const { message } = error;

  return (
    typeof message === 'string' &&
    !isNockError(message) &&
    CONNECTION_ERRORS.some(({ constructorName, pattern }) => {
      return (
        error.constructor.name === constructorName && pattern.test(message)
      );
    })
  );
}

/**
 * Determines whether the given error message refers to a Nock error.
 *
 * It's important that if we failed to mock a request in a test, the resulting
 * error does not cause the request to be retried so that we can see it right
 * away.
 *
 * @param message - The error message to test.
 * @returns True if the message indicates a missing Nock mock, false otherwise.
 */
function isNockError(message: string) {
  return message.includes('Nock:');
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
  readonly endpointUrl: URL;

  /**
   * A common set of options that the request options will extend.
   */
  readonly #fetchOptions: FetchOptions;

  /**
   * An RPC service that represents a failover endpoint which will be invoked
   * while the circuit for _this_ service is open.
   */
  readonly #failoverService: RpcServiceOptions['failoverService'];

  /**
   * The policy that wraps the request.
   */
  readonly #policy: ServicePolicy;

  /**
   * Constructs a new RpcService object.
   *
   * @param options - The options. See {@link RpcServiceOptions}.
   */
  constructor(options: RpcServiceOptions) {
    const {
      btoa: givenBtoa,
      endpointUrl,
      failoverService,
      fetch: givenFetch,
      fetchOptions = {},
      policyOptions = {},
    } = options;

    this.#fetch = givenFetch;
    this.endpointUrl = getNormalizedEndpointUrl(endpointUrl);
    this.#fetchOptions = this.#getDefaultFetchOptions(
      this.endpointUrl,
      fetchOptions,
      givenBtoa,
    );
    this.#failoverService = failoverService;

    const policy = createServicePolicy({
      maxRetries: DEFAULT_MAX_RETRIES,
      maxConsecutiveFailures: DEFAULT_MAX_CONSECUTIVE_FAILURES,
      ...policyOptions,
      retryFilterPolicy: handleWhen((error) => {
        return (
          // Ignore errors where the request failed to establish
          isConnectionError(error) ||
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
  ) {
    return this.#policy.onRetry((data) => {
      listener({ ...data, endpointUrl: this.endpointUrl.toString() });
    });
  }

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
      { endpointUrl: string; failoverEndpointUrl?: string }
    >,
  ) {
    return this.#policy.onBreak((data) => {
      listener({
        ...data,
        endpointUrl: this.endpointUrl.toString(),
        failoverEndpointUrl: this.#failoverService
          ? this.#failoverService.endpointUrl.toString()
          : undefined,
      });
    });
  }

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
  ) {
    return this.#policy.onDegraded(() => {
      listener({ endpointUrl: this.endpointUrl.toString() });
    });
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
   * @returns The decoded JSON-RPC response from the endpoint. For 405 status, returns a JSON-RPC error response with code -32601.
   * For 429 status, returns a JSON-RPC error response with code -32005.
   * @throws A timeout error if the response HTTP status is 503 or 504.
   * @throws A generic error if the response HTTP status is not 2xx and not one of the specifically handled status codes (405, 429, 503, 504).
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
   * @returns The decoded JSON-RPC response from the endpoint. For 405 status, returns a JSON-RPC error response with code -32601.
   * For 429 status, returns a JSON-RPC error response with code -32005.
   * @throws A timeout error if the response HTTP status is 503 or 504.
   * @throws A generic error if the response HTTP status is not 2xx and not one of the specifically handled status codes (405, 429, 503, 504).
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
   * @returns The decoded JSON-RPC response from the endpoint. For 405 status, returns a JSON-RPC error response with code -32601.
   * For 429 status, returns a JSON-RPC error response with code -32005.
   * @throws A timeout error if the response HTTP status is 503 or 504.
   * @throws A generic error if the response HTTP status is not 2xx and not one of the specifically handled status codes (405, 429, 503, 504).
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
      const response = await this.#fetch(this.endpointUrl, fetchOptions);

      if (response.status === 405) {
        return {
          id: jsonRpcRequest.id,
          jsonrpc: jsonRpcRequest.jsonrpc,
          error: {
            code: -32601,
            message: 'The method does not exist / is not available.',
          },
        };
      }

      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const retryDelay = retryAfter ? parseInt(retryAfter, 10) * 1000 : 1000;

        return {
          id: jsonRpcRequest.id,
          jsonrpc: jsonRpcRequest.jsonrpc,
          error: {
            code: -32005,
            message: 'Request is being rate limited.',
            data: {
              retryAfter: retryDelay,
            },
          },
        };
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
