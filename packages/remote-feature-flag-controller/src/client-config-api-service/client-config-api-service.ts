import {
  circuitBreaker,
  ConsecutiveBreaker,
  ExponentialBackoff,
  handleAll,
  type IPolicy,
  retry,
  wrap,
  CircuitState,
} from 'cockatiel';

import type {
  FeatureFlags,
  ClientType,
  DistributionType,
  EnvironmentType,
} from '../remote-feature-flag-controller-types';

type ApiResponse = {
  error: boolean;
  message: string;
  statusCode: string | null;
  statusText: string | null;
  cachedData: FeatureFlags;
  cacheTimestamp: number | null;
};

const DEFAULT_FETCH_RETRIES = 3;
// Each update attempt will result (1 + retries) calls if the server is down
const DEFAULT_MAX_CONSECUTIVE_FAILURES = (1 + DEFAULT_FETCH_RETRIES) * 3;

const DEFAULT_DEGRADED_THRESHOLD = 5000;

/**
 * This service is responsible for fetching feature flags from the ClientConfig API.
 */
export class ClientConfigApiService {
  #fetch: typeof fetch;

  #policy: IPolicy;

  #baseUrl = 'https://client-config.api.cx.metamask.io/v1';

  #client: ClientType;

  #distribution: DistributionType;

  #environment: EnvironmentType;

  /**
   * Constructs a new ClientConfigApiService object.
   *
   * @param args - The arguments.
   * @param args.fetch - A function that can be used to make an HTTP request.
   * @param args.retries - Number of retry attempts for each fetch request.
   * @param args.maximumConsecutiveFailures - The maximum number of consecutive failures
   * allowed before breaking the circuit and pausing further fetch attempts.
   * @param args.circuitBreakDuration - The duration for which the circuit remains open after
   * too many consecutive failures.
   * @param args.onBreak - Callback invoked when the circuit breaks.
   * @param args.onDegraded - Callback invoked when the service is degraded (requests resolving too slowly).
   * @param args.config - The configuration object, includes client, distribution, and environment.
   * @param args.config.client - The client type (e.g., 'extension', 'mobile').
   * @param args.config.distribution - The distribution type (e.g., 'main', 'flask').
   * @param args.config.environment - The environment type (e.g., 'prod', 'rc', 'dev').
   */
  constructor({
    fetch: fetchFunction,
    retries = DEFAULT_FETCH_RETRIES,
    maximumConsecutiveFailures = DEFAULT_MAX_CONSECUTIVE_FAILURES,
    circuitBreakDuration = 30 * 60 * 1000,
    onBreak,
    onDegraded,
    config,
  }: {
    fetch: typeof fetch;
    retries?: number;
    maximumConsecutiveFailures?: number;
    circuitBreakDuration?: number;
    onBreak?: () => void;
    onDegraded?: () => void;
    config: {
      client: ClientType;
      distribution: DistributionType;
      environment: EnvironmentType;
    };
  }) {
    this.#fetch = fetchFunction;
    this.#client = config.client;
    this.#distribution = config.distribution;
    this.#environment = config.environment;

    const retryPolicy = retry(handleAll, {
      maxAttempts: retries,
      backoff: new ExponentialBackoff(),
    });

    const circuitBreakerPolicy = circuitBreaker(handleAll, {
      halfOpenAfter: circuitBreakDuration,
      breaker: new ConsecutiveBreaker(maximumConsecutiveFailures),
    });

    if (onBreak) {
      circuitBreakerPolicy.onBreak(onBreak);
    }

    if (onDegraded) {
      retryPolicy.onGiveUp(() => {
        if (circuitBreakerPolicy.state === CircuitState.Closed) {
          onDegraded();
        }
      });

      retryPolicy.onSuccess(({ duration }) => {
        if (
          circuitBreakerPolicy.state === CircuitState.Closed &&
          duration > DEFAULT_DEGRADED_THRESHOLD // Default degraded threshold
        ) {
          onDegraded();
        }
      });
    }

    this.#policy = wrap(retryPolicy, circuitBreakerPolicy);
  }

  /**
   * Fetches feature flags from the API with specific client, distribution, and environment parameters.
   * Provides structured error handling, including fallback to cached data if available.
   * @param options - The options object
   * @param options.cachedData - Optional cached feature flags data
   * @param options.cacheTimestamp - Optional timestamp of the cached data
   * @returns An object of feature flags and their boolean values or a structured error object.
   */
  public async fetchRemoteFeatureFlags({
    cachedData,
    cacheTimestamp,
  }: {
    cachedData?: FeatureFlags;
    cacheTimestamp?: number;
  } = {}): Promise<ApiResponse> {
    const url = `${this.#baseUrl}/flags?client=${this.#client}&distribution=${
      this.#distribution
    }&environment=${this.#environment}`;

    try {
      const response = await this.#policy.execute(() =>
        this.#fetch(url, { cache: 'no-cache' }),
      );

      if (!response || !response.ok) {
        return {
          error: true,
          message: 'Failed to fetch flags',
          statusCode: response?.status?.toString() || null,
          statusText: response?.statusText || 'Error',
          cachedData: cachedData || [],
          cacheTimestamp: cacheTimestamp ?? Date.now(),
        };
      }

      const data = await response.json();

      return {
        error: false,
        message: 'Success',
        statusCode: response.status.toString(),
        statusText: response.statusText || 'OK',
        cachedData: data || [],
        cacheTimestamp: Date.now(),
      };
    } catch (error) {
      console.error('Feature flag API request failed:', error);

      const err = error as Error & {
        response?: { status: number; statusText: string };
      };
      return {
        error: true,
        message: err.message || 'Unknown error',
        statusCode: err.response?.status?.toString() || null,
        statusText: err.response?.statusText || null,
        cachedData: cachedData || [],
        cacheTimestamp: cacheTimestamp || Date.now(),
      };
    }
  }
}
