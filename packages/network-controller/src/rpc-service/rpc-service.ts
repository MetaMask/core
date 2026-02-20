import type {
  CreateServicePolicyOptions,
  ServicePolicy,
} from '@metamask/controller-utils';
import {
  BrokenCircuitError,
  HttpError,
  createServicePolicy,
  handleWhen,
} from '@metamask/controller-utils';
import { JsonRpcError, rpcErrors } from '@metamask/rpc-errors';
import { Duration, getErrorMessage, hasProperty } from '@metamask/utils';
import type {
  Json,
  JsonRpcParams,
  JsonRpcRequest,
  JsonRpcResponse,
} from '@metamask/utils';
import { CircuitState, IDisposable } from 'cockatiel';
import deepmerge from 'deepmerge';
import type { Logger } from 'loglevel';

import type { AbstractRpcService } from './abstract-rpc-service';
import type { FetchOptions } from './shared';
import { projectLogger, createModuleLogger } from '../logger';

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
   * A `loglevel` logger.
   */
  logger?: Pick<Logger, 'warn'>;
  /**
   * Options to pass to `createServicePolicy`. Note that `retryFilterPolicy` is
   * not accepted, as it is overwritten. See {@link createServicePolicy}.
   */
  policyOptions?: Omit<CreateServicePolicyOptions, 'retryFilterPolicy'>;
  /**
   * A function that checks if the user is currently offline. If it returns true,
   * connection errors will not be retried, preventing degraded and break
   * callbacks from being triggered.
   */
  isOffline: () => boolean;
};

const log = createModuleLogger(projectLogger, 'RpcService');

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
export function isConnectionError(error: unknown): boolean {
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
function isNockError(message: string): boolean {
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
export function isJsonParseError(error: unknown): boolean {
  return (
    error instanceof SyntaxError ||
    /invalid json/iu.test(getErrorMessage(error))
  );
}

/**
 * Determines whether the given error represents a HTTP server error
 * (502, 503, or 504) that should be retried.
 *
 * @param error - The error object to test.
 * @returns True if the error has an httpStatus of 502, 503, or 504.
 */
export function isHttpServerError(error: Error): boolean {
  return (
    'httpStatus' in error &&
    (error.httpStatus === 502 ||
      error.httpStatus === 503 ||
      error.httpStatus === 504)
  );
}

/**
 * Determines whether the given error has a `code` property of `ETIMEDOUT`.
 *
 * @param error - The error object to test.
 * @returns True if the error code is `ETIMEDOUT`.
 */
export function isTimeoutError(error: Error): boolean {
  return hasProperty(error, 'code') && error.code === 'ETIMEDOUT';
}

/**
 * Determines whether the given error has a `code` property of `ECONNRESET`.
 *
 * @param error - The error object to test.
 * @returns True if the error code is `ECONNRESET`.
 */
export function isConnectionResetError(error: Error): boolean {
  return hasProperty(error, 'code') && error.code === 'ECONNRESET';
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
 * Strips username and password from a URL.
 *
 * @param url - The URL to strip credentials from.
 * @returns A new URL object with credentials removed.
 */
function stripCredentialsFromUrl(url: URL): URL {
  const strippedUrl = new URL(url.toString());
  strippedUrl.username = '';
  strippedUrl.password = '';
  return strippedUrl;
}

/**
 * This class is responsible for making a request to an endpoint that implements
 * the JSON-RPC protocol. It is designed to gracefully handle network and server
 * failures, retrying requests using exponential backoff. It also offers a hook
 * which can used to respond to slow requests.
 */
export class RpcService implements AbstractRpcService {
  /**
   * The URL of the RPC endpoint.
   */
  readonly endpointUrl: URL;

  /**
   * The last error that the retry policy captured (or `undefined` if the last
   * execution of the service was successful).
   */
  lastError: Error | undefined;

  /**
   * The RPC method name of the current request being processed. This is passed
   * to `onDegraded` event listeners.
   *
   * Initialised to `''` so the type is `string` throughout the event chain.
   * The empty string is unreachable in practice because the method name is
   * guaranteed to be set after the current request is completed but before
   * any `onDegraded` callbacks are called.
   */
  #currentRpcMethodName = '';

  /**
   * The function used to make an HTTP request.
   */
  readonly #fetch: typeof fetch;

  /**
   * A common set of options that the request options will extend.
   */
  readonly #fetchOptions: FetchOptions;

  /**
   * A `loglevel` logger.
   */
  readonly #logger: RpcServiceOptions['logger'];

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
      fetch: givenFetch,
      logger,
      fetchOptions = {},
      policyOptions = {},
      isOffline,
    } = options;

    this.#fetch = givenFetch;
    const normalizedUrl = getNormalizedEndpointUrl(endpointUrl);
    this.#fetchOptions = this.#getDefaultFetchOptions(
      normalizedUrl,
      fetchOptions,
      givenBtoa,
    );
    this.endpointUrl = stripCredentialsFromUrl(normalizedUrl);
    this.#logger = logger;

    this.#policy = createServicePolicy({
      maxRetries: DEFAULT_MAX_RETRIES,
      maxConsecutiveFailures: DEFAULT_MAX_CONSECUTIVE_FAILURES,
      ...policyOptions,
      retryFilterPolicy: handleWhen((error) => {
        // If user is offline, don't retry any errors
        // This prevents degraded/break callbacks from being triggered
        if (isOffline()) {
          return false;
        }

        return (
          // Ignore errors where the request failed to establish
          isConnectionError(error) ||
          // Ignore server sent HTML error pages or truncated JSON responses
          isJsonParseError(error) ||
          // Ignore server overload errors
          isHttpServerError(error) ||
          // Ignore timeout errors
          isTimeoutError(error) ||
          // Ignore connection reset errors
          isConnectionResetError(error)
        );
      }),
    });
  }

  /**
   * Resets the underlying composite Cockatiel policy.
   *
   * This is useful in a collection of RpcServices where some act as failovers
   * for others where you effectively want to invalidate the failovers when the
   * primary recovers.
   */
  resetPolicy(): void {
    this.#policy.reset();
  }

  /**
   * @returns The state of the underlying circuit.
   */
  getCircuitState(): CircuitState {
    return this.#policy.getCircuitState();
  }

  /**
   * Listens for when the RPC service retries the request.
   *
   * @param listener - The callback to be called when the retry occurs.
   * @returns What {@link ServicePolicy.onRetry} returns.
   * @see {@link createServicePolicy}
   */
  onRetry(listener: Parameters<AbstractRpcService['onRetry']>[0]): IDisposable {
    return this.#policy.onRetry((data) => {
      listener({ ...data, endpointUrl: this.endpointUrl.toString() });
    });
  }

  /**
   * Listens for when the RPC service retries the request too many times in a
   * row, causing the underlying circuit to break.
   *
   * @param listener - The callback to be called when the circuit is broken.
   * @returns What {@link ServicePolicy.onBreak} returns.
   * @see {@link createServicePolicy}
   */
  onBreak(listener: Parameters<AbstractRpcService['onBreak']>[0]): IDisposable {
    return this.#policy.onBreak((data) => {
      // `{ isolated: true }` is a special object that shows up when `isolate`
      // is called on the circuit breaker. Usually `isolate` is used to hold the
      // circuit open, but we (ab)use this method in `createServicePolicy` to
      // reset the circuit breaker policy. When we do this, we don't want to
      // call `onBreak` handlers, because then it causes
      // `NetworkController:rpcEndpointUnavailable` and
      // `NetworkController:rpcEndpointChainUnavailable` to be published. So we
      // have to ignore that object here. The consequence is that `isolate`
      // doesn't function the way it is intended, at least in the context of an
      // RpcService. However, we are making a bet that we won't need to use it
      // other than how we are already using it.
      if (!('isolated' in data)) {
        listener({
          ...data,
          endpointUrl: this.endpointUrl.toString(),
        });
      }
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
    listener: Parameters<AbstractRpcService['onDegraded']>[0],
  ): IDisposable {
    return this.#policy.onDegraded((data) => {
      if (data === undefined) {
        listener({
          endpointUrl: this.endpointUrl.toString(),
          rpcMethodName: this.#currentRpcMethodName,
        });
      } else {
        listener({
          ...data,
          endpointUrl: this.endpointUrl.toString(),
          rpcMethodName: this.#currentRpcMethodName,
        });
      }
    });
  }

  /**
   * Listens for when the policy underlying this RPC service is available.
   *
   * @param listener - The callback to be called when the request is available.
   * @returns What {@link ServicePolicy.onAvailable} returns.
   * @see {@link createServicePolicy}
   */
  onAvailable(
    listener: Parameters<AbstractRpcService['onAvailable']>[0],
  ): IDisposable {
    return this.#policy.onAvailable(() => {
      listener({ endpointUrl: this.endpointUrl.toString() });
    });
  }

  /**
   * Makes a request to the RPC endpoint.
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
   * Makes a request to the RPC endpoint.
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
    // The request object may be frozen and must not be mutated.
    jsonRpcRequest: Readonly<JsonRpcRequest<Params>>,
    fetchOptions: FetchOptions = {},
  ): Promise<JsonRpcResponse<Result | null>> {
    const completeFetchOptions = this.#getCompleteFetchOptions(
      jsonRpcRequest,
      fetchOptions,
    );
    return await this.#executeAndProcessRequest<Result>(
      completeFetchOptions,
      jsonRpcRequest.method,
    );
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
    jsonRpcRequest: Readonly<JsonRpcRequest<Params>>,
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
   * @param rpcMethodName - The JSON-RPC method name of the current request.
   * @returns The decoded JSON-RPC response from the endpoint.
   * @throws An "authorized" JSON-RPC error (code -32006) if the response HTTP status is 401.
   * @throws A "rate limiting" JSON-RPC error (code -32005) if the response HTTP status is 429.
   * @throws A "resource unavailable" JSON-RPC error (code -32002) if the response HTTP status is 402, 404, or any 5xx.
   * @throws A generic HTTP client JSON-RPC error (code -32050) for any other 4xx HTTP status codes.
   * @throws A "parse" JSON-RPC error (code -32700) if the response is not valid JSON.
   */
  async #executeAndProcessRequest<Result extends Json>(
    fetchOptions: FetchOptions,
    rpcMethodName: string,
  ): Promise<JsonRpcResponse<Result> | JsonRpcResponse<null>> {
    let response: Response | undefined;
    try {
      log(
        `[${this.endpointUrl}] Circuit state`,
        this.#policy.getCircuitState(),
      );
      const jsonDecodedResponse = await this.#policy.execute(
        async (context) => {
          try {
            log(
              'REQUEST INITIATED:',
              this.endpointUrl.toString(),
              '::',
              fetchOptions,
              // @ts-expect-error This property _is_ here, the type of
              // ServicePolicy is just wrong.
              `(attempt ${context.attempt + 1})`,
            );
            response = await this.#fetch(this.endpointUrl, fetchOptions);
            if (!response.ok) {
              throw new HttpError(response.status);
            }
            log(
              'REQUEST SUCCESSFUL:',
              this.endpointUrl.toString(),
              response.status,
            );
            return await response.json();
          } finally {
            // Track the RPC method for the request that has just taken place.
            // We pass this property to `onDegraded` event listeners.
            //
            // We set this property after the request completes and not before
            // the request starts to account for race conditions. That is, if
            // there are two requests that are being performed concurrently, and
            // the second request fails fast but the first request succeeds
            // slowly, when `onDegraded` is called we want it to include the
            // first request as the RPC method, not the second.
            //
            // Also, we set this property within a `finally` block inside of the
            // function passed to `policy.execute` to ensure that it is set
            // before `onDegraded` gets called, no matter the outcome of the
            // request.
            this.#currentRpcMethodName = rpcMethodName;
          }
        },
      );
      this.lastError = undefined;
      return jsonDecodedResponse;
    } catch (error) {
      log('REQUEST ERROR:', this.endpointUrl.toString(), error);

      this.lastError =
        error instanceof Error ? error : new Error(getErrorMessage(error));

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
      } else if (error instanceof BrokenCircuitError) {
        this.#logger?.warn(error);
        const remainingCircuitOpenDuration =
          this.#policy.getRemainingCircuitOpenDuration();
        const formattedRemainingCircuitOpenDuration = Intl.NumberFormat(
          undefined,
          { maximumFractionDigits: 2 },
        ).format(
          (remainingCircuitOpenDuration ?? this.#policy.circuitBreakDuration) /
            Duration.Minute,
        );
        throw rpcErrors.resourceUnavailable({
          message: `RPC endpoint returned too many errors, retrying in ${formattedRemainingCircuitOpenDuration} minutes. Consider using a different RPC endpoint.`,
        });
      }
      throw error;
    }
  }
}
