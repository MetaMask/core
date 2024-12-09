import {
  circuitBreaker,
  ConsecutiveBreaker,
  ExponentialBackoff,
  handleAll,
  retry,
  wrap,
  CircuitState,
} from 'cockatiel';
import type { IPolicy } from 'cockatiel';

/**
 * The maximum number of times that a failing action should be re-run before
 * giving up.
 */
export const DEFAULT_MAX_RETRIES = 3;

/**
 * The maximum number of times that the action is allowed to fail before pausing
 * further retries.
 */
export const DEFAULT_MAX_CONSECUTIVE_FAILURES = (1 + DEFAULT_MAX_RETRIES) * 3;

/**
 * The default length of time (in milliseconds) to temporarily pause retries of
 * the action after enough consecutive failures.
 */
export const DEFAULT_CIRCUIT_BREAK_DURATION = 30 * 60 * 1000;

/**
 * The default length of time (in milliseconds) that governs when an action is
 * regarded as degraded (affecting when `onDegraded` is called).
 */
export const DEFAULT_DEGRADED_THRESHOLD = 5_000;

/**
 * Constructs an object exposing an `execute` method which, given a function,
 * will retry it with ever increasing delays until it succeeds. If it detects
 * too many consecutive failures, it will block further retries until a
 * designated time period has passed; this particular behavior is primarily
 * designed for services that wrap API calls so as not to make needless HTTP
 * requests when the API is down and to be able to recover when the API comes
 * back up. In addition, hooks allow for responding to certain events, one of
 * which can be used to detect when an HTTP request is performing slowly.
 *
 * Internally, the executor object makes use of the retry and circuit breaker
 * policies from the [Cockatiel](https://www.npmjs.com/package/cockatiel)
 * library; see there for more.
 *
 * @param options - The options to this function.
 * @param options.maxRetries - The maximum number of times that a failing action
 * should be re-run before giving up. Defaults to 3.
 * @param options.maxConsecutiveFailures - The maximum number of times that
 * the action is allowed to fail before pausing further retries. Defaults to 12.
 * @param options.circuitBreakDuration - The length of time (in milliseconds) to
 * pause retries of the action after the number of failures reaches
 * `maxConsecutiveFailures`.
 * @param options.degradedThreshold - The length of time (in milliseconds) that
 * governs when an action is regarded as degraded (affecting when `onDegraded`
 * is called). Defaults to 5 seconds.
 * @param options.onBreak - A function which is called when the action fails too
 * many times in a row.
 * @param options.onDegraded - A function which is called when the action
 * succeeds before `maxConsecutiveFailures` is reached, but takes more time
 * than the `degradedThreshold` to run.
 * @returns A Cockatiel policy object that can be used to run an arbitrary
 * action (a function).
 * @example
 * To use the policy, call `execute` on it and pass a function:
 * ``` ts
 * const policy = createServicePolicy({
 *   maxRetries: 3,
 *   maxConsecutiveFailures: 3,
 *   circuitBreakDuration: 5000,
 *   degradedThreshold: 2000,
 *   onBreak: () => {
 *     console.log('Circuit broke');
 *   },
 *   onDegraded: () => {
 *     console.log('Service is degraded');
 *   }
 * });
 *
 * await policy.execute(async () => {
 *   const response = await fetch('https://some/url');
 *   return await response.json();
 * });
 * ```
 * You may wish to store `policy` in a single place and reuse it each time you
 * want to execute your action. For instance:
 * ``` ts
 * class Service {
 *   constructor() {
 *     this.#policy = createServicePolicy({
 *       maxRetries: 3,
 *       maxConsecutiveFailures: 3,
 *       circuitBreakDuration: 5000,
 *       degradedThreshold: 2000,
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
  maxRetries = DEFAULT_MAX_RETRIES,
  maxConsecutiveFailures = DEFAULT_MAX_CONSECUTIVE_FAILURES,
  circuitBreakDuration = DEFAULT_CIRCUIT_BREAK_DURATION,
  degradedThreshold = DEFAULT_DEGRADED_THRESHOLD,
  onBreak = () => {
    // do nothing
  },
  onDegraded = () => {
    // do nothing
  },
}: {
  maxRetries?: number;
  maxConsecutiveFailures?: number;
  degradedThreshold?: number;
  circuitBreakDuration?: number;
  onBreak?: () => void;
  onDegraded?: () => void;
} = {}): IPolicy {
  const retryPolicy = retry(handleAll, {
    maxAttempts: maxRetries,
    // Retries of the action passed to the policy will be padded by increasing
    // delays, determined by a formula.
    backoff: new ExponentialBackoff(),
  });

  const circuitBreakerPolicy = circuitBreaker(handleAll, {
    // While the circuit is open, any additional invocations of the action
    // passed to the policy (either via automatic retries or by manually
    // executing the policy again) will result in a BrokenCircuitError. The
    // circuit will transition to a half-open state after the
    // `circuitBreakDuration` passes, after which the action will be allowed to
    // run again. If the action succeeds, the circuit will close, otherwise it
    // will open again.
    halfOpenAfter: circuitBreakDuration,
    breaker: new ConsecutiveBreaker(maxConsecutiveFailures),
  });

  // The `onBreak` callback will be called if the number of times the action
  // consistently throws exceeds the maximum consecutive number of failures.
  // Combined with the retry policy, this can happen if:
  // - `maxRetries` > `maxConsecutiveFailures` and the policy is executed once
  // - `maxRetries` <= `maxConsecutiveFailures` but the policy is executed
  //   multiple times, enough for the total number of retries to exceed
  //   `maxConsecutiveFailures`
  circuitBreakerPolicy.onBreak(onBreak);

  retryPolicy.onGiveUp(() => {
    if (circuitBreakerPolicy.state === CircuitState.Closed) {
      // The `onDegraded` callback will be called if the number of retries is
      // exceeded and the maximum number of consecutive failures has not been
      // reached yet (whether the policy is called once or multiple times).
      onDegraded();
    }
  });
  retryPolicy.onSuccess(({ duration }) => {
    if (
      circuitBreakerPolicy.state === CircuitState.Closed &&
      duration > degradedThreshold
    ) {
      // The `onDegraded` callback will also be called if the action passed to
      // the policy does not throw, but the time it takes for the action to run
      // exceeds the `degradedThreshold`.
      onDegraded();
    }
  });

  // Each time the retry policy retries, it will execute the circuit breaker
  // policy.
  return wrap(retryPolicy, circuitBreakerPolicy);
}
