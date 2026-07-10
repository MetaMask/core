import { CircuitState, ConstantBackoff, handleWhen } from 'cockatiel';

import {
  createServicePolicy,
  DEFAULT_CIRCUIT_BREAK_DURATION,
  DEFAULT_DEGRADED_THRESHOLD,
  DEFAULT_MAX_CONSECUTIVE_FAILURES,
  DEFAULT_MAX_RETRIES,
  ServicePolicy,
} from './create-service-policy';

describe('createServicePolicy', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('execute', () => {
    describe('when the service succeeds at least on the first attempt', () => {
      it('returns what the service returns', async () => {
        const policy = createServicePolicy();
        const result = await policy.execute(() => ({ some: 'data' }));
        expect(result).toStrictEqual({ some: 'data' });
      });

      it('fires onAvailable on the first successful execution and not again on subsequent successful executions', async () => {
        const mockService = jest.fn();
        const onAvailableListener = jest.fn();
        const policy = createServicePolicy();
        policy.onAvailable(onAvailableListener);

        await policy.execute(mockService);
        await policy.execute(mockService);
        await policy.execute(mockService);

        expect(onAvailableListener).toHaveBeenCalledTimes(1);
      });

      it('does not fire onDegraded when the service responds within the degraded threshold', async () => {
        const onDegradedListener = jest.fn();
        const policy = createServicePolicy();
        policy.onDegraded(onDegradedListener);

        await policy.execute(jest.fn());

        expect(onDegradedListener).not.toHaveBeenCalled();
      });

      it('fires onDegraded when the service takes longer than the degraded threshold', async () => {
        const degradedThreshold = 2_000;
        const delay = degradedThreshold + 1;
        const mockService = jest.fn(
          () =>
            new Promise<void>((resolve) => setTimeout(() => resolve(), delay)),
        );
        const onDegradedListener = jest.fn();
        const policy = createServicePolicy({
          degradedThreshold,
        });
        policy.onDegraded(onDegradedListener);

        const promise = policy.execute(mockService);
        jest.advanceTimersByTime(delay);
        await promise;

        expect(onDegradedListener).toHaveBeenCalledTimes(1);
      });

      it('does not fire onAvailable when the service takes longer than the degraded threshold', async () => {
        const degradedThreshold = 2_000;
        const delay = degradedThreshold + 1;
        const mockService = jest.fn(
          () =>
            new Promise<void>((resolve) => setTimeout(() => resolve(), delay)),
        );
        const onAvailableListener = jest.fn();
        const policy = createServicePolicy({
          degradedThreshold,
        });
        policy.onAvailable(onAvailableListener);

        const promise = policy.execute(mockService);
        jest.advanceTimersByTime(delay);
        await promise;

        expect(onAvailableListener).not.toHaveBeenCalled();
      });

      it('uses the default degraded threshold when none is provided', async () => {
        const delay = DEFAULT_DEGRADED_THRESHOLD + 1;
        const mockService = jest.fn(
          () =>
            new Promise<void>((resolve) => setTimeout(() => resolve(), delay)),
        );
        const onDegradedListener = jest.fn();
        const policy = createServicePolicy();
        policy.onDegraded(onDegradedListener);

        const promise = policy.execute(mockService);
        jest.advanceTimersByTime(delay);
        await promise;

        expect(onDegradedListener).toHaveBeenCalledTimes(1);
      });

      it('does not fire onBreak', async () => {
        const onBreakListener = jest.fn();
        const policy = createServicePolicy();
        policy.onBreak(onBreakListener);

        await policy.execute(jest.fn());

        expect(onBreakListener).not.toHaveBeenCalled();
      });
    });

    describe('when the service throws an error which has an httpStatus property', () => {
      it('treats errors with httpStatus >= 500 as service failures, making them circuit-breakable', async () => {
        const error = Object.assign(new Error('server error'), {
          httpStatus: 500,
        });
        const mockService = createErroringService({ error });
        const onBreakListener = jest.fn();
        const policy = createServicePolicyForTestingRetries({
          breakAfterFirstExecution: true,
        });
        policy.onBreak(onBreakListener);

        await ignoreRejection(policy.execute(mockService));

        expect(onBreakListener).toHaveBeenCalledTimes(1);
      });

      it('treats errors with httpStatus < 500 as non-service failures, making them non-circuit-breakable', async () => {
        const error = Object.assign(new Error('client error'), {
          httpStatus: 404,
        });
        const mockService = createErroringService({ error });
        const onBreakListener = jest.fn();
        const policy = createServicePolicyForTestingRetries({
          breakAfterFirstExecution: true,
        });
        policy.onBreak(onBreakListener);

        await ignoreRejection(policy.execute(mockService));

        expect(onBreakListener).not.toHaveBeenCalled();
      });
    });

    describe('when the service always throws', () => {
      describe.each([
        {
          desc: `using a default maxRetries (of ${DEFAULT_MAX_RETRIES})`,
          maxRetries: DEFAULT_MAX_RETRIES,
          options: {},
        },
        {
          desc: 'using a custom maxRetries',
          maxRetries: 5,
          options: { maxRetries: 5 },
        },
      ])('using $desc', ({ maxRetries, options }) => {
        it(`calls the service maxRetries + 1 times`, async () => {
          const mockService = createErroringService();
          const policy = createServicePolicyForTestingRetries({ options });

          await ignoreRejection(policy.execute(mockService));

          expect(mockService).toHaveBeenCalledTimes(maxRetries + 1);
        });

        it('fires onRetry once per retry', async () => {
          const mockService = createErroringService();
          const onRetryListener = jest.fn().mockImplementation(() => {
            jest.advanceTimersToNextTimer();
          });
          const policy = createServicePolicyForTestingRetries({
            options,
            onRetryListener,
          });

          await ignoreRejection(policy.execute(mockService));

          expect(onRetryListener).toHaveBeenCalledTimes(maxRetries);
        });
      });

      describe('when a single retry round does not break the circuit', () => {
        // Setting the number of attempts (maxRetries + 1) less than the
        // maximum number of consecutive failures causes the circuit to stay
        // closed even after calling `.execute` once
        const maxRetries = 2;
        const maxConsecutiveFailures = 4;

        it('throws the original error', async () => {
          const error = new Error('failure');
          const mockService = createErroringService({ error });
          const policy = createServicePolicyForTestingRetries({
            options: {
              maxRetries,
              maxConsecutiveFailures,
            },
          });

          await expect(policy.execute(mockService)).rejects.toThrow(error);
        });

        it('does not fire onAvailable', async () => {
          const mockService = createErroringService();
          const onAvailableListener = jest.fn();
          const policy = createServicePolicyForTestingRetries({
            options: {
              maxRetries,
              maxConsecutiveFailures,
            },
          });
          policy.onAvailable(onAvailableListener);

          await ignoreRejection(policy.execute(mockService));

          expect(onAvailableListener).not.toHaveBeenCalled();
        });

        it('fires onDegraded with the error', async () => {
          const error = new Error('failure');
          const mockService = createErroringService({ error });
          const onDegradedListener = jest.fn();
          const policy = createServicePolicyForTestingRetries({
            options: {
              maxRetries,
              maxConsecutiveFailures,
            },
          });
          policy.onDegraded(onDegradedListener);

          await ignoreRejection(policy.execute(mockService));

          expect(onDegradedListener).toHaveBeenCalledTimes(1);
          expect(onDegradedListener).toHaveBeenCalledWith({ error });
        });

        it('does not fire onBreak', async () => {
          const mockService = createErroringService();
          const onBreakListener = jest.fn();
          const policy = createServicePolicyForTestingRetries({
            options: {
              maxRetries,
              maxConsecutiveFailures,
            },
          });
          policy.onBreak(onBreakListener);

          await ignoreRejection(policy.execute(mockService));

          expect(onBreakListener).not.toHaveBeenCalled();
        });
      });

      describe('when a single retry round breaks the circuit after the last attempt', () => {
        // Setting maxConsecutiveFailures equal to maxRetries + 1 causes the
        // circuit to open after calling `.execute` only once
        const maxRetries = 2;
        const maxConsecutiveFailures = 3;

        it('throws the original error', async () => {
          const error = new Error('failure');
          const mockService = createErroringService({ error });
          const policy = createServicePolicyForTestingRetries({
            options: {
              maxRetries,
              maxConsecutiveFailures,
            },
          });

          await expect(policy.execute(mockService)).rejects.toThrow(error);
        });

        it('does not fire onAvailable', async () => {
          const mockService = createErroringService();
          const onAvailableListener = jest.fn();
          const policy = createServicePolicyForTestingRetries({
            options: {
              maxRetries,
              maxConsecutiveFailures,
            },
          });
          policy.onAvailable(onAvailableListener);

          await ignoreRejection(policy.execute(mockService));

          expect(onAvailableListener).not.toHaveBeenCalled();
        });

        it('does not fire onDegraded', async () => {
          const mockService = createErroringService();
          const onDegradedListener = jest.fn();
          const policy = createServicePolicyForTestingRetries({
            options: {
              maxRetries,
              maxConsecutiveFailures,
            },
          });
          policy.onDegraded(onDegradedListener);

          await ignoreRejection(policy.execute(mockService));

          expect(onDegradedListener).not.toHaveBeenCalled();
        });

        it('fires onBreak', async () => {
          const mockService = createErroringService();
          const onBreakListener = jest.fn();
          const policy = createServicePolicyForTestingRetries({
            options: {
              maxRetries,
              maxConsecutiveFailures,
            },
          });
          policy.onBreak(onBreakListener);

          await ignoreRejection(policy.execute(mockService));

          expect(onBreakListener).toHaveBeenCalledTimes(1);
        });

        it('throws BrokenCircuitError on the next service execution', async () => {
          const mockService = createErroringService();
          const policy = createServicePolicyForTestingRetries({
            options: {
              maxRetries,
              maxConsecutiveFailures,
            },
          });

          await ignoreRejection(policy.execute(mockService));

          await expect(policy.execute(mockService)).rejects.toThrow(
            'Execution prevented because the circuit breaker is open',
          );
        });
      });

      describe('when a single retry round breaks the circuit before reaching the max number of retries', () => {
        // Setting the number of attempts (maxRetries + 1) greater than the
        // maximum number of consecutive failures causes the circuit to break
        // before the last attempt is reached
        const maxRetries = 3;
        const maxConsecutiveFailures = 3;

        it('throws BrokenCircuitError', async () => {
          const mockService = createErroringService();
          const policy = createServicePolicyForTestingRetries({
            options: {
              maxRetries,
              maxConsecutiveFailures,
            },
          });

          await expect(policy.execute(mockService)).rejects.toThrow(
            'Execution prevented because the circuit breaker is open',
          );
        });

        it('does not fire onAvailable', async () => {
          const mockService = createErroringService();
          const onAvailableListener = jest.fn();
          const policy = createServicePolicyForTestingRetries({
            options: {
              maxRetries,
              maxConsecutiveFailures,
            },
          });
          policy.onAvailable(onAvailableListener);

          await ignoreRejection(policy.execute(mockService));

          expect(onAvailableListener).not.toHaveBeenCalled();
        });

        it('does not fire onDegraded', async () => {
          const mockService = createErroringService();
          const onDegradedListener = jest.fn();
          const policy = createServicePolicyForTestingRetries({
            options: {
              maxRetries,
              maxConsecutiveFailures,
            },
          });
          policy.onDegraded(onDegradedListener);

          await ignoreRejection(policy.execute(mockService));

          expect(onDegradedListener).not.toHaveBeenCalled();
        });

        it('fires onBreak', async () => {
          const mockService = createErroringService();
          const onBreakListener = jest.fn();
          const policy = createServicePolicyForTestingRetries({
            options: {
              maxRetries,
              maxConsecutiveFailures,
            },
          });
          policy.onBreak(onBreakListener);

          await ignoreRejection(policy.execute(mockService));

          expect(onBreakListener).toHaveBeenCalledTimes(1);
        });
      });
    });

    describe('when the service throws at first but succeeds on the final attempt', () => {
      it('returns the eventual successful result from the service', async () => {
        const mockService = createErroringService({
          failUntilNthAttempt: DEFAULT_MAX_RETRIES + 1,
        });
        const policy = createServicePolicyForTestingRetries();

        const result = await policy.execute(mockService);

        expect(result).toStrictEqual({ some: 'data' });
      });

      it('fires onAvailable on the first successful (fast) execution and not again on subsequent successful (fast) executions', async () => {
        const mockService = createErroringService({
          failUntilNthAttempt: DEFAULT_MAX_RETRIES + 1,
        });
        const onAvailableListener = jest.fn();
        const policy = createServicePolicyForTestingRetries();
        policy.onAvailable(onAvailableListener);

        await policy.execute(mockService);
        await policy.execute(() => {
          // dummy function
        });

        expect(onAvailableListener).toHaveBeenCalledTimes(1);
      });

      it('does not fire onDegraded if the final attempt takes less time than the degraded threshold', async () => {
        const mockService = createErroringService({
          failUntilNthAttempt: DEFAULT_MAX_RETRIES + 1,
        });
        const onDegradedListener = jest.fn();
        const policy = createServicePolicyForTestingRetries();
        policy.onDegraded(onDegradedListener);

        await policy.execute(mockService);

        expect(onDegradedListener).not.toHaveBeenCalled();
      });

      it('fires onDegraded when the final attempt takes longer than the degraded threshold', async () => {
        const degradedThreshold = 2_000;
        const delay = degradedThreshold + 1;
        let attempts = 0;
        const mockService = jest.fn(
          () =>
            new Promise<{ some: string }>((resolve, reject) => {
              attempts += 1;
              if (attempts === 1 + DEFAULT_MAX_RETRIES) {
                setTimeout(() => resolve({ some: 'data' }), delay);
              } else {
                reject(new Error('failure'));
              }
            }),
        );
        const onDegradedListener = jest.fn();
        const policy = createServicePolicyForTestingRetries({
          options: {
            degradedThreshold,
          },
        });
        policy.onDegraded(onDegradedListener);

        const promise = policy.execute(mockService);
        await jest.runAllTimersAsync();
        await promise;

        expect(onDegradedListener).toHaveBeenCalledTimes(1);
      });

      it('does not fire onAvailable when the final attempt takes longer than the degraded threshold', async () => {
        const degradedThreshold = 2_000;
        const delay = degradedThreshold + 1;
        let attempts = 0;
        const mockService = jest.fn(
          () =>
            new Promise<{ some: string }>((resolve, reject) => {
              attempts += 1;
              if (attempts === 1 + DEFAULT_MAX_RETRIES) {
                setTimeout(() => resolve({ some: 'data' }), delay);
              } else {
                reject(new Error('failure'));
              }
            }),
        );
        const onAvailableListener = jest.fn();
        const policy = createServicePolicyForTestingRetries({
          options: {
            degradedThreshold,
          },
        });
        policy.onAvailable(onAvailableListener);

        const promise = policy.execute(mockService);
        await jest.runAllTimersAsync();
        await promise;

        expect(onAvailableListener).not.toHaveBeenCalled();
      });
    });

    describe('when the service fails enough times to break the circuit, then the circuit break duration elapses', () => {
      it('returns what the service returns if it then succeeds', async () => {
        // Setup
        const circuitBreakDuration = 5_000;
        let attempts = 0;
        const mockService = jest.fn(() => {
          attempts += 1;
          if (attempts > DEFAULT_MAX_CONSECUTIVE_FAILURES) {
            return { some: 'data' };
          }
          throw new Error('failure');
        });
        const policy = createServicePolicyForTestingRetries({
          options: {
            circuitBreakDuration,
          },
        });

        // Drive the circuit open, then advance past the circuit break duration
        await ignoreRejection(policy.execute(mockService));
        await ignoreRejection(policy.execute(mockService));
        await ignoreRejection(policy.execute(mockService));
        jest.advanceTimersByTime(circuitBreakDuration);

        const result = await policy.execute(mockService);
        expect(result).toStrictEqual({ some: 'data' });
      });

      it('uses the default circuit break duration when none is provided', async () => {
        // Setup
        let attempts = 0;
        const mockService = jest.fn(() => {
          attempts += 1;
          if (attempts > DEFAULT_MAX_CONSECUTIVE_FAILURES) {
            return { some: 'data' };
          }
          throw new Error('failure');
        });
        const policy = createServicePolicyForTestingRetries();

        // Drive the circuit open, then advance past the circuit break duration
        await ignoreRejection(policy.execute(mockService));
        await ignoreRejection(policy.execute(mockService));
        await ignoreRejection(policy.execute(mockService));
        jest.advanceTimersByTime(DEFAULT_CIRCUIT_BREAK_DURATION);

        const result = await policy.execute(mockService);
        expect(result).toStrictEqual({ some: 'data' });
      });

      it('fires onAvailable again after the circuit recovers', async () => {
        // Setup
        const circuitBreakDuration = 5_000;
        let attempts = 0;
        const mockService = jest.fn(() => {
          attempts += 1;
          if (
            attempts === 1 ||
            attempts > DEFAULT_MAX_CONSECUTIVE_FAILURES + 1
          ) {
            return { some: 'data' };
          }
          throw new Error('failure');
        });
        const onAvailableListener = jest.fn();
        const policy = createServicePolicyForTestingRetries({
          options: {
            circuitBreakDuration,
          },
        });
        policy.onAvailable(onAvailableListener);

        // Check that onAvailable fires at first for completeness
        await policy.execute(mockService);
        expect(onAvailableListener).toHaveBeenCalledTimes(1);

        // Drive the circuit open
        await ignoreRejection(policy.execute(mockService));
        await ignoreRejection(policy.execute(mockService));
        await ignoreRejection(policy.execute(mockService));

        // Recover
        jest.advanceTimersByTime(circuitBreakDuration);
        await policy.execute(mockService);
        expect(onAvailableListener).toHaveBeenCalledTimes(2);
      });

      it('does not fire onAvailable again if the circuit recovers but then the service fails', async () => {
        // Setup
        const circuitBreakDuration = 5_000;
        let attempts = 0;
        const mockService = jest.fn(() => {
          attempts += 1;
          if (attempts === 1) {
            return { some: 'data' };
          }
          throw new Error('failure');
        });
        const onAvailableListener = jest.fn();
        const policy = createServicePolicyForTestingRetries({
          options: {
            circuitBreakDuration,
          },
        });
        policy.onAvailable(onAvailableListener);

        // Establish baseline
        await policy.execute(mockService);
        expect(onAvailableListener).toHaveBeenCalledTimes(1);

        // Drive the circuit open
        await ignoreRejection(policy.execute(mockService));
        await ignoreRejection(policy.execute(mockService));
        await ignoreRejection(policy.execute(mockService));

        // Recover
        jest.advanceTimersByTime(circuitBreakDuration);
        await ignoreRejection(policy.execute(mockService));
        expect(onAvailableListener).toHaveBeenCalledTimes(1);
      });
    });

    describe('using a custom retryFilterPolicy', () => {
      it('throws the error immediately without retrying if retryFilterPolicy filters the error out', async () => {
        const error = new Error('failure');
        const mockService = jest.fn(() => {
          throw error;
        });
        const policy = createServicePolicyForTestingRetries({
          options: {
            retryFilterPolicy: handleWhen(
              (caughtError) => caughtError.message !== 'failure',
            ),
          },
        });

        await expect(policy.execute(mockService)).rejects.toThrow(error);
        expect(mockService).toHaveBeenCalledTimes(1);
      });

      it('does not fire onRetry, onBreak, onDegraded, or onAvailable if retryFilterPolicy filters the error out', async () => {
        const error = new Error('failure');
        const mockService = jest.fn(() => {
          throw error;
        });
        const onRetryListener = jest.fn();
        const onBreakListener = jest.fn();
        const onDegradedListener = jest.fn();
        const onAvailableListener = jest.fn();
        const policy = createServicePolicyForTestingRetries({
          options: {
            retryFilterPolicy: handleWhen(
              (caughtError) => caughtError.message !== 'failure',
            ),
          },
        });
        policy.onRetry(onRetryListener);
        policy.onBreak(onBreakListener);
        policy.onDegraded(onDegradedListener);
        policy.onAvailable(onAvailableListener);

        await ignoreRejection(policy.execute(mockService));

        expect(onRetryListener).not.toHaveBeenCalled();
        expect(onBreakListener).not.toHaveBeenCalled();
        expect(onDegradedListener).not.toHaveBeenCalled();
        expect(onAvailableListener).not.toHaveBeenCalled();
      });

      it('throws the error after retrying if retryFilterPolicy filters the error in', async () => {
        const error = new Error('failure');
        const mockService = jest.fn(() => {
          throw error;
        });
        const policy = createServicePolicyForTestingRetries({
          options: {
            retryFilterPolicy: handleWhen(
              (caughtError) => caughtError.message === 'failure',
            ),
          },
        });

        await expect(policy.execute(mockService)).rejects.toThrow(error);
        expect(mockService).toHaveBeenCalledTimes(DEFAULT_MAX_RETRIES + 1);
      });

      it('fires onRetry if retryFilterPolicy filters the error in', async () => {
        const error = new Error('failure');
        const mockService = jest.fn(() => {
          throw error;
        });
        const onRetryListener = jest.fn();
        const policy = createServicePolicyForTestingRetries({
          options: {
            retryFilterPolicy: handleWhen(
              (caughtError) => caughtError.message === 'failure',
            ),
          },
        });
        policy.onRetry(onRetryListener);

        await ignoreRejection(policy.execute(mockService));
        expect(onRetryListener).toHaveBeenCalled();
      });
    });

    describe('using a custom isServiceFailure predicate', () => {
      it('opens the circuit when the predicate treats the error as a service failure', async () => {
        const error = new Error('failure');
        const mockService = createErroringService({ error });
        const onBreakListener = jest.fn();
        const policy = createServicePolicyForTestingRetries({
          options: {
            isServiceFailure: () => true,
          },
          breakAfterFirstExecution: true,
        });
        policy.onBreak(onBreakListener);

        await ignoreRejection(policy.execute(mockService));

        expect(onBreakListener).toHaveBeenCalledTimes(1);
        expect(onBreakListener).toHaveBeenCalledWith({ error });
      });

      it('never opens the circuit when the predicate does not treat the error as a service failure', async () => {
        const error = new Error('failure');
        const mockService = createErroringService({ error });
        const onBreakListener = jest.fn();
        const policy = createServicePolicyForTestingRetries({
          options: {
            isServiceFailure: () => false,
          },
          breakAfterFirstExecution: true,
        });
        policy.onBreak(onBreakListener);

        await ignoreRejection(policy.execute(mockService));

        expect(onBreakListener).not.toHaveBeenCalled();
      });
    });
  });

  describe('getRemainingCircuitOpenDuration', () => {
    it('returns null when the circuit is closed', () => {
      const policy = createServicePolicyForTestingRetries();
      expect(policy.getRemainingCircuitOpenDuration()).toBeNull();
    });

    it('returns the milliseconds remaining before the circuit transitions to half-open', async () => {
      const policy = createServicePolicyForTestingRetries();

      // Drive the circuit open
      await ignoreRejection(policy.execute(createErroringService()));
      await ignoreRejection(policy.execute(createErroringService()));
      await ignoreRejection(policy.execute(createErroringService()));
      jest.advanceTimersByTime(1_000);

      expect(policy.getRemainingCircuitOpenDuration()).toBe(
        DEFAULT_CIRCUIT_BREAK_DURATION - 1_000,
      );
    });
  });

  describe('getCircuitState', () => {
    it('tracks circuit state transitions: Closed → Open → HalfOpen → Open', async () => {
      // Establish initial state
      const policy = createServicePolicyForTestingRetries();
      expect(policy.getCircuitState()).toBe(CircuitState.Closed);

      // Drive the circuit open
      await ignoreRejection(policy.execute(createErroringService()));
      await ignoreRejection(policy.execute(createErroringService()));
      await ignoreRejection(policy.execute(createErroringService()));
      expect(policy.getCircuitState()).toBe(CircuitState.Open);

      // Advance to half-open
      jest.advanceTimersByTime(DEFAULT_CIRCUIT_BREAK_DURATION);
      const promise = ignoreRejection(policy.execute(createErroringService()));
      expect(policy.getCircuitState()).toBe(CircuitState.HalfOpen);
      await promise;
      expect(policy.getCircuitState()).toBe(CircuitState.Open);
    });
  });

  describe('reset', () => {
    it('transitions the circuit from Open to Closed', async () => {
      const policy = createServicePolicyForTestingRetries();
      // Drive the circuit open
      await ignoreRejection(policy.execute(createErroringService()));
      await ignoreRejection(policy.execute(createErroringService()));
      await ignoreRejection(policy.execute(createErroringService()));
      expect(policy.getCircuitState()).toBe(CircuitState.Open);

      policy.reset();

      expect(policy.getCircuitState()).toBe(CircuitState.Closed);
    });

    it('allows the service to succeed after the circuit was open', async () => {
      let attempts = 0;
      const mockService = jest.fn(() => {
        attempts += 1;
        if (attempts > DEFAULT_MAX_CONSECUTIVE_FAILURES) {
          return { some: 'data' };
        }
        throw new Error('failure');
      });
      const policy = createServicePolicyForTestingRetries();
      // Drive the circuit open
      await ignoreRejection(policy.execute(mockService));
      await ignoreRejection(policy.execute(mockService));
      await ignoreRejection(policy.execute(mockService));

      policy.reset();

      expect(await policy.execute(mockService)).toStrictEqual({ some: 'data' });
    });

    it('allows the service to fail again without throwing BrokenCircuitError', async () => {
      const service = createErroringService();
      const policy = createServicePolicyForTestingRetries();
      // Drive the circuit open
      await ignoreRejection(policy.execute(service));
      await ignoreRejection(policy.execute(service));
      await ignoreRejection(policy.execute(service));

      policy.reset();

      await expect(policy.execute(service)).rejects.toThrow('failure');
    });

    it('fires onAvailable again after reset when the service succeeds', async () => {
      // Setup
      let attempts = 0;
      const mockService = jest.fn(() => {
        attempts += 1;
        if (attempts === 1 || attempts > DEFAULT_MAX_CONSECUTIVE_FAILURES + 1) {
          return { some: 'data' };
        }
        throw new Error('failure');
      });
      const onAvailableListener = jest.fn();
      const policy = createServicePolicyForTestingRetries();
      policy.onAvailable(onAvailableListener);

      // Establish baseline
      await policy.execute(mockService);
      expect(onAvailableListener).toHaveBeenCalledTimes(1);

      // Drive the circuit open
      await ignoreRejection(policy.execute(mockService));
      await ignoreRejection(policy.execute(mockService));
      await ignoreRejection(policy.execute(mockService));

      // Reset
      policy.reset();
      await policy.execute(mockService);
      expect(onAvailableListener).toHaveBeenCalledTimes(2);
    });
  });
});

/**
 * Some tests involve a rejected promise that is not necessarily the focus of
 * the test. In these cases we don't want to ignore the error in case the
 * promise _isn't_ rejected, but we don't want to highlight the assertion,
 * either.
 *
 * @param promise - A promise that rejects.
 */
async function ignoreRejection<Type>(promise: Promise<Type>): Promise<void> {
  await expect(promise).rejects.toThrow(expect.any(Error));
}

/**
 * Builds a service policy that takes care of some boilerplate when testing
 * retries by:
 *
 * - using a zero-delay constant backoff so tests do not need to account for
 *   jitter when advancing timers
 * - advancing timers automatically whenever retries occur
 * - allowing for the service to break on first execution
 *
 * @param args - The arguments.
 * @param args.options - Any additional options to pass to `createServicePolicy`.
 * @param args.onRetryListener - The onRetry callback to register.
 * @returns The service policy.
 * @param args.breakAfterFirstExecution - Assuming that the service always
 * error, causes the policy's circuit to break the first time the service is
 * executed.
 */
function createServicePolicyForTestingRetries({
  options,
  onRetryListener = (): ReturnType<Parameters<ServicePolicy['onRetry']>[0]> =>
    jest.advanceTimersToNextTimer(),
  breakAfterFirstExecution = false,
}: {
  options?: Parameters<typeof createServicePolicy>[0];
  onRetryListener?: Parameters<ServicePolicy['onRetry']>[0];
  breakAfterFirstExecution?: boolean;
} = {}): ReturnType<typeof createServicePolicy> {
  const policy = createServicePolicy({
    backoff: new ConstantBackoff(0),
    ...(breakAfterFirstExecution
      ? { maxRetries: 0, maxConsecutiveFailures: 1 }
      : {}),
    ...options,
  });
  policy.onRetry(onRetryListener);
  return policy;
}

/**
 * Builds a mock service that throws `error` on every call before some number of
 * attempts, then returns `result`.
 *
 * @param options - Options.
 * @param options.failUntilNthAttempt - The 1-based attempt number at which the
 * service should start succeeding (default: Infinity — never succeeds).
 * @param options.error - The error to throw on failure (default: `new
 * Error('failure')`).
 * @param options.result - The value to return on success (default: `{ some:
 * 'data' }`).
 * @returns A Jest mock function.
 */
function createErroringService({
  failUntilNthAttempt = Infinity,
  error = new Error('failure'),
  result = { some: 'data' },
}: {
  failUntilNthAttempt?: number;
  error?: Error;
  result?: unknown;
} = {}): jest.Mock {
  let attempts = 0;
  return jest.fn(() => {
    attempts += 1;
    if (attempts >= failUntilNthAttempt) {
      return result;
    }
    throw error;
  });
}
