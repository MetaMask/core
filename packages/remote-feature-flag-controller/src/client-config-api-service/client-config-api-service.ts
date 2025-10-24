import {
  createServicePolicy,
  DEFAULT_CIRCUIT_BREAK_DURATION,
  DEFAULT_MAX_CONSECUTIVE_FAILURES,
  DEFAULT_MAX_RETRIES,
  ExponentialBackoff,
} from '@metamask/controller-utils';
import type { ServicePolicy } from '@metamask/controller-utils';
import type { IBackoff, IBackoffFactory } from 'cockatiel';

import type { AbstractClientConfigApiService } from './abstract-client-config-api-service';
import { BASE_URL } from '../constants';
import type {
  FeatureFlags,
  ClientType,
  DistributionType,
  EnvironmentType,
  ServiceResponse,
  ApiDataResponse,
} from '../remote-feature-flag-controller-types';

/**
 * Custom backoff implementation that uses specific interval values from an array.
 * Each retry uses the corresponding interval from the array (in seconds).
 */
class CustomIntervalBackoff implements IBackoffFactory<unknown> {
  private readonly intervals: number[];

  private currentIndex: number = 0;

  constructor(intervals: number[]) {
    // Convert seconds to milliseconds
    this.intervals = intervals.map((interval) => interval * 1000);
  }

  next(): IBackoff<unknown> {
    const duration = this.intervals[this.currentIndex];
    const nextIndex = this.currentIndex + 1;

    return {
      duration,
      next: () => {
        const nextBackoff = new CustomIntervalBackoff(
          this.intervals.map((i) => i / 1000),
        );
        nextBackoff.currentIndex = nextIndex;
        return nextBackoff.next();
      },
    };
  }
}

/**
 * Validates that the custom backoff interval array exactly matches the number of retries.
 *
 * @param customBackoffInterval - Array of retry intervals in seconds (must equal maxRetries length)
 * @param maxRetries - Maximum number of retries configured
 * @throws Error if validation fails
 */
function validateCustomBackoffInterval(
  customBackoffInterval: number[],
  maxRetries: number,
): void {
  if (!Array.isArray(customBackoffInterval)) {
    throw new Error('customBackoffInterval must be an array');
  }

  if (customBackoffInterval.length === 0) {
    throw new Error('customBackoffInterval array cannot be empty');
  }

  if (
    customBackoffInterval.some(
      (interval) => typeof interval !== 'number' || interval <= 0,
    )
  ) {
    throw new Error(
      'All customBackoffInterval values must be positive numbers',
    );
  }

  if (customBackoffInterval.length !== maxRetries) {
    throw new Error(
      `customBackoffInterval array length (${customBackoffInterval.length}) must be equal to maxRetries (${maxRetries})`,
    );
  }
}

/**
 * Creates the appropriate backoff strategy based on the provided parameters.
 * If customBackoffInterval is provided, uses array-based intervals.
 * Otherwise, uses exponential backoff with minute-based progression.
 *
 * @param customBackoffInterval - Optional array of retry intervals in seconds
 * @param maxRetries - Maximum number of retries for validation
 * @returns A backoff factory compatible with Cockatiel
 */
function createCustomBackoff(
  customBackoffInterval: number[],
  maxRetries: number,
): IBackoffFactory<unknown> {
  if (customBackoffInterval) {
    if (maxRetries !== undefined) {
      validateCustomBackoffInterval(customBackoffInterval, maxRetries);
    }
    return new CustomIntervalBackoff(customBackoffInterval);
  }

  // Default exponential backoff with minute-based intervals
  return new ExponentialBackoff();
}

/**
 * This service is responsible for fetching feature flags from the ClientConfig API.
 */
export class ClientConfigApiService implements AbstractClientConfigApiService {
  readonly #fetch: typeof fetch;

  readonly #policy: ServicePolicy;

  readonly #client: ClientType;

  readonly #distribution: DistributionType;

  readonly #environment: EnvironmentType;

  /**
   * Constructs a new ClientConfigApiService object.
   *
   * @param args - The arguments.
   * @param args.fetch - A function that can be used to make an HTTP request.
   * If your JavaScript environment supports `fetch` natively, you'll probably
   * want to pass that; otherwise you can pass an equivalent (such as `fetch`
   * via `node-fetch`).
   * @param args.retries - Number of retry attempts for each fetch request.
   * @param args.maximumConsecutiveFailures - The maximum number of consecutive
   * failures allowed before breaking the circuit and pausing further fetch
   * attempts.
   * @param args.circuitBreakDuration - The amount of time to wait when the
   * circuit breaks from too many consecutive failures.
   * @param args.customBackoffInterval - Optional array of retry intervals in seconds.
   * If provided, array length must exactly match the retries parameter.
   * Example: [100, 200, 300] means 1st retry after 100s, 2nd after 200s, 3rd after 300s.
   * @param args.config - The configuration object, includes client,
   * distribution, and environment.
   * @param args.config.client - The client type (e.g., 'extension', 'mobile').
   * @param args.config.distribution - The distribution type (e.g., 'main',
   * 'flask').
   * @param args.config.environment - The environment type (e.g., 'prod', 'rc',
   * 'dev').
   */
  constructor(args: {
    fetch: typeof fetch;
    retries?: number;
    maximumConsecutiveFailures?: number;
    circuitBreakDuration?: number;
    customBackoffInterval?: number[];
    config: {
      client: ClientType;
      distribution: DistributionType;
      environment: EnvironmentType;
    };
  });

  /**
   * Constructs a new ClientConfigApiService object.
   *
   * @deprecated This signature is deprecated; please use the `onBreak` and
   * `onDegraded` methods instead.
   * @param args - The arguments.
   * @param args.fetch - A function that can be used to make an HTTP request.
   * If your JavaScript environment supports `fetch` natively, you'll probably
   * want to pass that; otherwise you can pass an equivalent (such as `fetch`
   * via `node-fetch`).
   * @param args.retries - Number of retry attempts for each fetch request.
   * @param args.maximumConsecutiveFailures - The maximum number of consecutive
   * failures allowed before breaking the circuit and pausing further fetch
   * attempts.
   * @param args.circuitBreakDuration - The amount of time to wait when the
   * circuit breaks from too many consecutive failures.
   * @param args.onBreak - Callback for when the circuit breaks, useful
   * for capturing metrics about network failures.
   * @param args.onDegraded - Callback for when the API responds successfully
   * but takes too long to respond (5 seconds or more).
   * @param args.customBackoffInterval - Optional array of retry intervals in seconds.
   * If provided, array length must exactly match the retries parameter.
   * Example: [100, 200, 300] means 1st retry after 100s, 2nd after 200s, 3rd after 300s.
   * @param args.config - The configuration object, includes client,
   * distribution, and environment.
   * @param args.config.client - The client type (e.g., 'extension', 'mobile').
   * @param args.config.distribution - The distribution type (e.g., 'main',
   * 'flask').
   * @param args.config.environment - The environment type (e.g., 'prod', 'rc',
   * 'dev').
   */
  // eslint-disable-next-line @typescript-eslint/unified-signatures
  constructor(args: {
    fetch: typeof fetch;
    retries?: number;
    maximumConsecutiveFailures?: number;
    circuitBreakDuration?: number;
    onBreak?: () => void;
    onDegraded?: () => void;
    customBackoffInterval?: number[];
    config: {
      client: ClientType;
      distribution: DistributionType;
      environment: EnvironmentType;
    };
  });

  constructor({
    fetch: fetchFunction,
    retries = DEFAULT_MAX_RETRIES,
    maximumConsecutiveFailures = DEFAULT_MAX_CONSECUTIVE_FAILURES,
    circuitBreakDuration = DEFAULT_CIRCUIT_BREAK_DURATION,
    customBackoffInterval,
    onBreak,
    onDegraded,
    config,
  }: {
    fetch: typeof fetch;
    retries?: number;
    maximumConsecutiveFailures?: number;
    circuitBreakDuration?: number;
    customBackoffInterval?: number[];
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

    this.#policy = createServicePolicy({
      maxRetries: retries,
      maxConsecutiveFailures: maximumConsecutiveFailures,
      circuitBreakDuration,
      backoff: customBackoffInterval
        ? createCustomBackoff(customBackoffInterval, retries)
        : undefined,
    });
    if (onBreak) {
      this.#policy.onBreak(onBreak);
    }
    if (onDegraded) {
      this.#policy.onDegraded(onDegraded);
    }
  }

  /**
   * Listens for when the request to the API fails too many times in a row.
   *
   * @param args - The same arguments that {@link ServicePolicy.onBreak}
   * takes.
   * @returns What {@link ServicePolicy.onBreak} returns.
   */
  onBreak(...args: Parameters<ServicePolicy['onBreak']>) {
    return this.#policy.onBreak(...args);
  }

  /**
   * Listens for when the API is degraded.
   *
   * @param args - The same arguments that {@link ServicePolicy.onDegraded}
   * takes.
   * @returns What {@link ServicePolicy.onDegraded} returns.
   */
  onDegraded(...args: Parameters<ServicePolicy['onDegraded']>) {
    return this.#policy.onDegraded(...args);
  }

  /**
   * Fetches feature flags from the API with specific client, distribution, and environment parameters.
   * Provides structured error handling, including fallback to cached data if available.
   *
   * @returns An object of feature flags and their boolean values or a structured error object.
   */
  public async fetchRemoteFeatureFlags(): Promise<ServiceResponse> {
    const url = `${BASE_URL}/flags?client=${this.#client}&distribution=${
      this.#distribution
    }&environment=${this.#environment}`;

    const response = await this.#policy.execute(() =>
      this.#fetch(url, { cache: 'no-cache' }),
    );

    if (!response.ok) {
      throw new Error('Failed to fetch remote feature flags');
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error('Feature flags api did not return an array');
    }

    const remoteFeatureFlags = this.flattenFeatureFlags(data);

    return {
      remoteFeatureFlags,
      cacheTimestamp: Date.now(),
    };
  }

  /**
   * Flattens an array of feature flag objects into a single feature flags object.
   *
   * @param responseData - Array of objects containing feature flag key-value pairs
   * @returns A single object containing all feature flags merged together
   * @example
   * // Input: [{ flag1: true }, { flag2: [] }]
   * // Output: { flag1: true, flag2: [] }
   */
  private flattenFeatureFlags(responseData: ApiDataResponse): FeatureFlags {
    return responseData.reduce((acc, curr) => {
      return { ...acc, ...curr };
    }, {});
  }
}
