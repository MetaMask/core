import {
  BrokenCircuitError,
  CircuitState,
  EventEmitter as CockatielEventEmitter,
  ConsecutiveBreaker,
  ExponentialBackoff,
  ConstantBackoff,
  circuitBreaker,
  handleAll,
  handleWhen,
  retry,
  wrap,
} from 'cockatiel';
import type {
  CircuitBreakerPolicy,
  Event as CockatielEvent,
  IBackoffFactory,
  IPolicy,
  Policy,
  RetryPolicy,
} from 'cockatiel';

export {
  BrokenCircuitError,
  CircuitState,
  ConstantBackoff,
  ExponentialBackoff,
  handleAll,
  handleWhen,
};

export type { CockatielEvent };

/**
 * The options for `createServicePolicy`.
 */
export type CreateServicePolicyOptions = {
  /**
   * The backoff strategy to use. Mainly useful for testing so that a constant
   * backoff can be used when mocking timers. Defaults to an instance of
   * ExponentialBackoff.
   */
  backoff?: IBackoffFactory<unknown>;
  /**
   * The length of time (in milliseconds) to pause retries of the action after
   * the number of failures reaches `maxConsecutiveFailures`.
   */
  circuitBreakDuration?: number;
  /**
   * The length of time (in milliseconds) that governs when the service is
   * regarded as degraded (affecting when `onDegraded` is called).
   */
  degradedThreshold?: number;
  /**
   * The maximum number of times that the service is allowed to fail before
   * pausing further retries.
   */
  maxConsecutiveFailures?: number;
  /**
   * The maximum number of times that a failing service should be re-invoked
   * before giving up.
   */
  maxRetries?: number;
  /**
   * The policy used to control when the service should be retried based on
   * either the result of the service or an error that it throws. For instance,
   * you could use this to retry only certain errors. See `handleWhen` and
   * friends from Cockatiel for more.
   */
  retryFilterPolicy?: Policy;
};

/**
 * The service policy object.
 */
export type ServicePolicy = IPolicy & {
  /**
   * The Cockatiel circuit breaker policy that the service policy uses
   * internally.
   */
  circuitBreakerPolicy: CircuitBreakerPolicy;
  /**
   * The Cockatiel retry policy that the service policy uses internally.
   */
  retryPolicy: RetryPolicy;
  /**
   * A function which is called when the number of times that the service fails
   * in a row meets the set maximum number of consecutive failures.
   */
  onBreak: CircuitBreakerPolicy['onBreak'];
  /**
   * A function which is called in two circumstances: 1) when the service
   * succeeds before the maximum number of consecutive failures is reached, but
   * takes more time than the `degradedThreshold` to run, or 2) if the service
   * never succeeds before the retry policy gives up and before the maximum
   * number of consecutive failures has been reached.
   */
  onDegraded: CockatielEvent<void>;
  /**
   * A function which will be called by the retry policy each time the service
   * fails and the policy kicks off a timer to re-run the service. This is
   * primarily useful in tests where we are mocking timers.
   */
  onRetry: RetryPolicy['onRetry'];
};

/**
 * The maximum number of times that a failing service should be re-run before
 * giving up.
 */
export const DEFAULT_MAX_RETRIES = 3;

/**
 * The maximum number of times that the service is allowed to fail before
 * pausing further retries. This is set to a value such that if given a
 * service that continually fails, the policy needs to be executed 3 times
 * before further retries are paused.
 */
export const DEFAULT_MAX_CONSECUTIVE_FAILURES = (1 + DEFAULT_MAX_RETRIES) * 3;

/**
 * The default length of time (in milliseconds) to temporarily pause retries of
 * the service after enough consecutive failures.
 */
export const DEFAULT_CIRCUIT_BREAK_DURATION = 30 * 60 * 1000;

/**
 * The default length of time (in milliseconds) that governs when the service is
 * regarded as degraded (affecting when `onDegraded` is called).
 */
export const DEFAULT_DEGRADED_THRESHOLD = 5_000;

const isServiceFailure = (error: unknown) => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'number'
  ) {
    const { code } = error;
    // Only consider errors with code -32603, -32002, or -32700 as service failures
    return code === -32603 || code === -32002 || code === -32700;
  }

  // If the error is not an object, or doesn't have a numeric code property,
  // consider it a service failure (e.g., network errors, timeouts, etc.)
  return true;
};

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
 * @param options - The options to this function. See
 * {@link CreateServicePolicyOptions}.
 * @returns The service policy.
 * @example
 * This function is designed to be used in the context of a service class like
 * this:
 * ``` ts
 * class Service {
 *   constructor() {
 *     this.#policy = createServicePolicy({
 *       maxRetries: 3,
 *       retryFilterPolicy: handleWhen((error) => {
 *         return error.message.includes('oops');
 *       }),
 *       maxConsecutiveFailures: 3,
 *       circuitBreakDuration: 5000,
 *       degradedThreshold: 2000,
 *       onBreak: () => {
 *         console.log('Circuit broke');
 *       },
 *       onDegraded: () => {
 *         console.log('Service is degraded');
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
export function createServicePolicy(
  options: CreateServicePolicyOptions = {},
): ServicePolicy {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    retryFilterPolicy = handleAll,
    maxConsecutiveFailures = DEFAULT_MAX_CONSECUTIVE_FAILURES,
    circuitBreakDuration = DEFAULT_CIRCUIT_BREAK_DURATION,
    degradedThreshold = DEFAULT_DEGRADED_THRESHOLD,
    backoff = new ExponentialBackoff(),
  } = options;

  const retryPolicy = retry(retryFilterPolicy, {
    // Note that although the option here is called "max attempts", it's really
    // maximum number of *retries* (attempts past the initial attempt).
    maxAttempts: maxRetries,
    // Retries of the service will be executed following ever increasing delays,
    // determined by a backoff formula.
    backoff,
  });
  const onRetry = retryPolicy.onRetry.bind(retryPolicy);

  const circuitBreakerPolicy = circuitBreaker(handleWhen(isServiceFailure), {
    // While the circuit is open, any additional invocations of the service
    // passed to the policy (either via automatic retries or by manually
    // executing the policy again) will result in a BrokenCircuitError. This
    // will remain the case until `circuitBreakDuration` passes, after which the
    // service will be allowed to run again. If the service succeeds, the
    // circuit will close, otherwise it will remain open.
    halfOpenAfter: circuitBreakDuration,
    breaker: new ConsecutiveBreaker(maxConsecutiveFailures),
  });
  const onBreak = circuitBreakerPolicy.onBreak.bind(circuitBreakerPolicy);

  const onDegradedEventEmitter = new CockatielEventEmitter<void>();
  retryPolicy.onGiveUp(() => {
    if (circuitBreakerPolicy.state === CircuitState.Closed) {
      onDegradedEventEmitter.emit();
    }
  });
  retryPolicy.onSuccess(({ duration }) => {
    if (
      circuitBreakerPolicy.state === CircuitState.Closed &&
      duration > degradedThreshold
    ) {
      onDegradedEventEmitter.emit();
    }
  });
  const onDegraded = onDegradedEventEmitter.addListener;

  // Every time the retry policy makes an attempt, it executes the circuit
  // breaker policy, which executes the service.
  const policy = wrap(retryPolicy, circuitBreakerPolicy);

  return {
    ...policy,
    circuitBreakerPolicy,
    retryPolicy,
    onBreak,
    onDegraded,
    onRetry,
  };
}
