import {
  circuitBreaker,
  ConsecutiveBreaker,
  ExponentialBackoff,
  handleAll,
  retry,
  wrap,
} from 'cockatiel';
import type { IPolicy } from 'cockatiel';

export type { IPolicy as IServicePolicy };

/**
 * The maximum number of times that a failing service should be re-run before
 * giving up.
 */
export const DEFAULT_MAX_RETRIES = 3;

/**
 * The maximum number of times that the service is allowed to fail before
 * pausing further retries.
 */
export const DEFAULT_MAX_CONSECUTIVE_FAILURES = (1 + DEFAULT_MAX_RETRIES) * 3;

/**
 * The default length of time (in milliseconds) to temporarily pause retries of
 * the service after enough consecutive failures.
 */
export const DEFAULT_CIRCUIT_BREAK_DURATION = 30 * 60 * 1000;

/**
 * Constructs an object exposing an `execute` method which, given a function —
 * hereafter called the "service" — will retry that service with ever increasing
 * delays until it succeeds. If the policy detects too many consecutive
 * failures, it will block further retries until a designated time period has
 * passed; this particular behavior is primarily designed for services that wrap
 * API calls so as not to make needless HTTP requests when the API is down and
 * to be able to recover when the API comes back up. In addition, hooks allow
 * for responding to certain events, one of which can be used to detect when an
 * HTTP request is performing slowly.
 *
 * Internally, this function makes use of the retry and circuit breaker policies
 * from the [Cockatiel](https://www.npmjs.com/package/cockatiel) library; see
 * there for more.
 *
 * @param options - The options to this function.
 * @param options.maxConsecutiveFailures - The maximum number of times that
 * the service is allowed to fail before pausing further retries. Defaults to 12.
 * @param options.onBreak - A function which is called when the service fails
 * too many times in a row (specifically, more than `maxConsecutiveFailures`).
 * @param options.onRetry - A function which will be called the moment the
 * policy kicks off a timer to re-run the function passed to the policy. This
 * is primarily useful in tests where we are mocking timers.
 * @returns The service policy.
 * @example
 * This function is designed to be used in the context of a service class like
 * this:
 * ``` ts
 * class Service {
 *   constructor() {
 *     this.#policy = createServicePolicy({
 *       maxConsecutiveFailures: 3,
 *       onBreak: () => {
 *         console.log('Circuit broke');
 *       },
 *     });
 *   }
 *
 *   async fetch() {
 *     return await this.#policy.execute(async () => {
 *       const response = await fetch('https://some/url');
 *       return await response.json();
 *     });
 *   }
 * }
 * ```
 */
export function createServicePolicy({
  maxConsecutiveFailures = DEFAULT_MAX_CONSECUTIVE_FAILURES,
  onBreak = () => {
    // do nothing
  },
  onRetry = () => {
    // do nothing
  },
}: {
  maxConsecutiveFailures?: number;
  onBreak?: () => void;
  onRetry?: () => void;
} = {}): IPolicy {
  const retryPolicy = retry(handleAll, {
    // Note that although the option here is called "max attempts", it's really
    // maximum number of *retries* (attempts past the initial attempt).
    maxAttempts: DEFAULT_MAX_RETRIES,
    // Retries of the service will be executed following ever increasing delays,
    // determined by a backoff formula.
    backoff: new ExponentialBackoff(),
  });

  const circuitBreakerPolicy = circuitBreaker(handleAll, {
    // While the circuit is open, any additional invocations of the service
    // passed to the policy (either via automatic retries or by manually
    // executing the policy again) will result in a BrokenCircuitError. This
    // will remain the case until the default circuit break duration passes,
    // after which the service will be allowed to run again. If the service
    // succeeds, the circuit will close, otherwise it will remain open.
    halfOpenAfter: DEFAULT_CIRCUIT_BREAK_DURATION,
    breaker: new ConsecutiveBreaker(maxConsecutiveFailures),
  });

  // The `onBreak` callback will be called if the service consistently throws
  // for as many times as exceeds the maximum consecutive number of failures.
  // Combined with the retry policy, this can happen if:
  // - `maxConsecutiveFailures` < the default max retries (3) and the policy is
  // executed once
  // - `maxConsecutiveFailures` >= the default max retries (3) but the policy is
  //   executed multiple times, enough for the total number of retries to exceed
  //   `maxConsecutiveFailures`
  circuitBreakerPolicy.onBreak(onBreak);

  // The `onRetryPolicy` callback will be called each time the service is
  // invoked (including retries).
  retryPolicy.onRetry(onRetry);

  // The retry policy really retries the circuit breaker policy, which invokes
  // the service.
  return wrap(retryPolicy, circuitBreakerPolicy);
}
