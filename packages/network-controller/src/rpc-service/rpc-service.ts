import type {
  CreateServicePolicyOptions,
  ServicePolicy,
} from '@metamask/controller-utils';
import {
  CircuitState,
  HttpError,
  createServicePolicy,
  handleWhen,
} from '@metamask/controller-utils';
import { JsonRpcError, rpcErrors } from '@metamask/rpc-errors';
import type { JsonRpcRequest } from '@metamask/utils';
import {
  getErrorMessage,
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
 * Custom JSON-RPC error codes for specific cases.
 *
 * These should be moved to `@metamask/rpc-errors` eventually.
 */
export const CUSTOM_RPC_ERRORS = {
  unauthorized: -32006,
  httpClientError: -32080,
} as const;

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
 * Determine whether the given error message indicates a failure to parse JSON.
 *
 * This is different in tests vs. implementation code because it may manifest as
 * a FetchError or a SyntaxError.
 *
 * @param error - The error object to test.
 * @returns True if the error indicates a JSON parse error, false otherwise.
 */
function isJsonParseError(error: unknown) {
  return (
    error instanceof SyntaxError ||
    /invalid json/iu.test(getErrorMessage(error))
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
          isJsonParseError(error) ||
          // Ignore server overload errors
          ('httpStatus' in error &&
            (error.httpStatus === 502 ||
              error.httpStatus === 503 ||
              error.httpStatus === 504)) ||
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
   * @returns The decoded JSON-RPC response from the endpoint.
   * @throws An "authorized" JSON-RPC error (code -32006) if the response HTTP status is 401.
   * @throws A "rate limiting" JSON-RPC error (code -32005) if the response HTTP status is 429.
   * @throws A "resource unavailable" JSON-RPC error (code -32002) if the response HTTP status is 402, 404, or any 5xx.
   * @throws A generic HTTP client JSON-RPC error (code -32050) for any other 4xx HTTP status codes.
   * @throws A "parse" JSON-RPC error (code -32700) if the response is not valid JSON.
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
   * @throws An "authorized" JSON-RPC error (code -32006) if the response HTTP status is 401.
   * @throws A "rate limiting" JSON-RPC error (code -32005) if the response HTTP status is 429.
   * @throws A "resource unavailable" JSON-RPC error (code -32002) if the response HTTP status is 402, 404, or any 5xx.
   * @throws A generic HTTP client JSON-RPC error (code -32050) for any other 4xx HTTP status codes.
   * @throws A "parse" JSON-RPC error (code -32700) if the response is not valid JSON.
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
      return await this.#processRequest<Result>(completeFetchOptions);
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
   * @param fetchOptions - The options for `fetch`; will be combined with the
   * fetch options passed to the constructor
   * @returns The decoded JSON-RPC response from the endpoint.
   * @throws An "authorized" JSON-RPC error (code -32006) if the response HTTP status is 401.
   * @throws A "rate limiting" JSON-RPC error (code -32005) if the response HTTP status is 429.
   * @throws A "resource unavailable" JSON-RPC error (code -32002) if the response HTTP status is 402, 404, or any 5xx.
   * @throws A generic HTTP client JSON-RPC error (code -32050) for any other 4xx HTTP status codes.
   * @throws A "parse" JSON-RPC error (code -32700) if the response is not valid JSON.
   */
  async #processRequest<Result extends Json>(
    fetchOptions: FetchOptions,
  ): Promise<JsonRpcResponse<Result> | JsonRpcResponse<null>> {
    let response: Response | undefined;
    try {
      return await this.#policy.execute(async () => {
        response = await this.#fetch(this.endpointUrl, fetchOptions);
        if (!response.ok) {
          throw new HttpError(response.status);
        }
        return await response.json();
      });
    } catch (error) {
      if (error instanceof HttpError) {
        const status = error.httpStatus;
        if (status === 401) {
          throw new JsonRpcError(
            CUSTOM_RPC_ERRORS.unauthorized,
            'Unauthorized.',
            {
              httpStatus: status,
            },
          );
        }
        if (status === 429) {
          throw rpcErrors.limitExceeded({
            message: 'Request is being rate limited.',
            data: {
              httpStatus: status,
            },
          });
        }
        if (status >= 500 || status === 402 || status === 404) {
          throw rpcErrors.resourceUnavailable({
            message: 'RPC endpoint not found or unavailable.',
            data: {
              httpStatus: status,
            },
          });
        }

        // Handle all other 4xx errors as generic HTTP client errors
        throw new JsonRpcError(
          CUSTOM_RPC_ERRORS.httpClientError,
          'RPC endpoint returned HTTP client error.',
          {
            httpStatus: status,
          },
        );
      } else if (isJsonParseError(error)) {
        throw rpcErrors.parse({
          message: 'RPC endpoint did not return JSON.',
        });
      }
      throw error;
    }
  }
}
