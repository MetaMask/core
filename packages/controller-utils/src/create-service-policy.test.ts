import { CircuitState, handleWhen } from 'cockatiel';

import {
  createServicePolicy,
  DEFAULT_CIRCUIT_BREAK_DURATION,
  DEFAULT_DEGRADED_THRESHOLD,
  DEFAULT_MAX_CONSECUTIVE_FAILURES,
  DEFAULT_MAX_RETRIES,
} from './create-service-policy';

describe('createServicePolicy', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('wrapping a service that succeeds on the first try', () => {
    it('returns a policy that returns what the service returns', async () => {
      const mockService = jest.fn(() => ({ some: 'data' }));
      const policy = createServicePolicy();

      const returnValue = await policy.execute(mockService);

      expect(returnValue).toStrictEqual({ some: 'data' });
    });

    it('only calls the service once before returning', async () => {
      const mockService = jest.fn();
      const policy = createServicePolicy();

      await policy.execute(mockService);

      expect(mockService).toHaveBeenCalledTimes(1);
    });

    it('does not call onBreak listeners, since the circuit never opens', async () => {
      const mockService = jest.fn();
      const onBreakListener = jest.fn();
      const policy = createServicePolicy();

      policy.onBreak(onBreakListener);

      await policy.execute(mockService);

      expect(onBreakListener).not.toHaveBeenCalled();
    });

    describe.each([
      {
        desc: `the default degraded threshold (${DEFAULT_DEGRADED_THRESHOLD})`,
        threshold: DEFAULT_DEGRADED_THRESHOLD,
        options: {},
      },
      {
        desc: 'a custom degraded threshold',
        threshold: 2000,
        options: { degradedThreshold: 2000 },
      },
    ])('using $desc', ({ threshold, options }) => {
      describe('if the service execution time is below the threshold', () => {
        it('does not call onDegraded listeners', async () => {
          const mockService = jest.fn();
          const onDegradedListener = jest.fn();
          const policy = createServicePolicy(options);
          policy.onDegraded(onDegradedListener);

          await policy.execute(mockService);

          expect(onDegradedListener).not.toHaveBeenCalled();
        });

        it('calls onAvailable listeners once, even if the service is called more than once', async () => {
          const mockService = jest.fn();
          const onAvailableListener = jest.fn();
          const policy = createServicePolicy(options);
          policy.onAvailable(onAvailableListener);

          await policy.execute(mockService);
          await policy.execute(mockService);

          expect(onAvailableListener).toHaveBeenCalledTimes(1);
        });
      });

      describe('if the service execution time is beyond the threshold', () => {
        it('calls onDegraded listeners once', async () => {
          const delay = threshold + 1;
          const mockService = jest.fn(() => {
            return new Promise<void>((resolve) => {
              setTimeout(() => resolve(), delay);
            });
          });
          const onDegradedListener = jest.fn();
          const policy = createServicePolicy(options);
          policy.onDegraded(onDegradedListener);

          const promise = policy.execute(mockService);
          jest.advanceTimersByTime(delay);
          await promise;

          expect(onDegradedListener).toHaveBeenCalledTimes(1);
        });

        it('does not call onAvailable listeners', async () => {
          const delay = threshold + 1;
          const mockService = jest.fn(() => {
            return new Promise<void>((resolve) => {
              setTimeout(() => resolve(), delay);
            });
          });
          const onAvailableListener = jest.fn();
          const policy = createServicePolicy(options);
          policy.onAvailable(onAvailableListener);

          const promise = policy.execute(mockService);
          jest.advanceTimersByTime(delay);
          await promise;

          expect(onAvailableListener).not.toHaveBeenCalled();
        });
      });
    });
  });

  describe('wrapping a service that always fails', () => {
    describe('if a custom retry filter policy is given and the retry filter policy filters out the thrown error', () => {
      it('throws what the service throws', async () => {
        const error = new Error('failure');
        const mockService = jest.fn(() => {
          throw error;
        });
        const policy = createServicePolicy({
          retryFilterPolicy: handleWhen(
            (caughtError) => caughtError.message !== 'failure',
          ),
        });

        const promise = policy.execute(mockService);

        await expect(promise).rejects.toThrow(error);
      });

      it('calls the service once and only once', async () => {
        const error = new Error('failure');
        const mockService = jest.fn(() => {
          throw error;
        });
        const policy = createServicePolicy({
          retryFilterPolicy: handleWhen(
            (caughtError) => caughtError.message !== 'failure',
          ),
        });

        const promise = policy.execute(mockService);
        await ignoreRejection(promise);

        expect(mockService).toHaveBeenCalledTimes(1);
      });

      it('does not call onRetry listeners', async () => {
        const error = new Error('failure');
        const mockService = jest.fn(() => {
          throw error;
        });
        const onRetryListener = jest.fn();
        const policy = createServicePolicy({
          retryFilterPolicy: handleWhen(
            (caughtError) => caughtError.message !== 'failure',
          ),
        });
        policy.onRetry(onRetryListener);

        const promise = policy.execute(mockService);
        await ignoreRejection(promise);

        expect(onRetryListener).not.toHaveBeenCalled();
      });

      it('does not call onBreak listeners', async () => {
        const error = new Error('failure');
        const mockService = jest.fn(() => {
          throw error;
        });
        const onBreakListener = jest.fn();
        const policy = createServicePolicy({
          retryFilterPolicy: handleWhen(
            (caughtError) => caughtError.message !== 'failure',
          ),
        });

        policy.onBreak(onBreakListener);

        const promise = policy.execute(mockService);
        // It's safe not to await this promise; adding it to the promise queue
        // is enough to prevent this test from running indefinitely.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        jest.runAllTimersAsync();
        await ignoreRejection(promise);

        expect(onBreakListener).not.toHaveBeenCalled();
      });

      it('does not call onDegraded listeners', async () => {
        const error = new Error('failure');
        const mockService = jest.fn(() => {
          throw error;
        });
        const onDegradedListener = jest.fn();
        const policy = createServicePolicy({
          retryFilterPolicy: handleWhen(
            (caughtError) => caughtError.message !== 'failure',
          ),
        });
        policy.onDegraded(onDegradedListener);

        const promise = policy.execute(mockService);
        // It's safe not to await this promise; adding it to the promise queue
        // is enough to prevent this test from running indefinitely.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        jest.runAllTimersAsync();
        await ignoreRejection(promise);

        expect(onDegradedListener).not.toHaveBeenCalled();
      });

      it('does not call onAvailable listeners', async () => {
        const error = new Error('failure');
        const mockService = jest.fn(() => {
          throw error;
        });
        const onAvailableListener = jest.fn();
        const policy = createServicePolicy({
          retryFilterPolicy: handleWhen(
            (caughtError) => caughtError.message !== 'failure',
          ),
        });
        policy.onAvailable(onAvailableListener);

        const promise = policy.execute(mockService);
        // It's safe not to await this promise; adding it to the promise queue
        // is enough to prevent this test from running indefinitely.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        jest.runAllTimersAsync();
        await ignoreRejection(promise);

        expect(onAvailableListener).not.toHaveBeenCalled();
      });
    });

    describe('using the default retry filter policy (which retries all errors)', () => {
      describe(`using the default max retries (${DEFAULT_MAX_RETRIES})`, () => {
        it(`calls the service a total of ${
          1 + DEFAULT_MAX_RETRIES
        } times, delaying each retry using a backoff formula`, async () => {
          const error = new Error('failure');
          const mockService = jest.fn(() => {
            throw error;
          });
          const policy = createServicePolicy();
          // Each retry delay is randomized using a decorrelated jitter formula,
          // so we need to prevent that
          jest.spyOn(Math, 'random').mockReturnValue(0);

          const promise = policy.execute(mockService);
          // It's safe not to await these promises; adding them to the promise
          // queue is enough to prevent this test from running indefinitely.
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          jest.advanceTimersByTimeAsync(0);
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          jest.advanceTimersByTimeAsync(176.27932892814937);
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          jest.advanceTimersByTimeAsync(186.8886145345685);
          await ignoreRejection(promise);

          expect(mockService).toHaveBeenCalledTimes(1 + DEFAULT_MAX_RETRIES);
        });

        it('calls onRetry listeners once per retry', async () => {
          const error = new Error('failure');
          const mockService = jest.fn(() => {
            throw error;
          });
          const onRetryListener = jest.fn();
          const policy = createServicePolicy();
          policy.onRetry(onRetryListener);

          const promise = policy.execute(mockService);
          // It's safe not to await this promise; adding it to the promise queue is
          // enough to prevent this test from running indefinitely.
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          jest.runAllTimersAsync();
          await ignoreRejection(promise);

          expect(onRetryListener).toHaveBeenCalledTimes(DEFAULT_MAX_RETRIES);
        });

        describe(`using the default max number of consecutive failures (${DEFAULT_MAX_CONSECUTIVE_FAILURES})`, () => {
          it('throws what the service throws', async () => {
            const error = new Error('failure');
            const mockService = jest.fn(() => {
              throw error;
            });
            const policy = createServicePolicy();

            const promise = policy.execute(mockService);
            // It's safe not to await this promise; adding it to the promise
            // queue is enough to prevent this test from running indefinitely.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            jest.runAllTimersAsync();

            await expect(promise).rejects.toThrow(error);
          });

          it('does not call onBreak listeners, since the max number of consecutive failures is never reached', async () => {
            const error = new Error('failure');
            const mockService = jest.fn(() => {
              throw error;
            });
            const onBreakListener = jest.fn();
            const policy = createServicePolicy();

            policy.onBreak(onBreakListener);

            const promise = policy.execute(mockService);
            // It's safe not to await this promise; adding it to the promise
            // queue is enough to prevent this test from running indefinitely.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            jest.runAllTimersAsync();
            await ignoreRejection(promise);

            expect(onBreakListener).not.toHaveBeenCalled();
          });

          it('calls onDegraded listeners once with the error, since the circuit is still closed', async () => {
            const error = new Error('failure');
            const mockService = jest.fn(() => {
              throw error;
            });
            const onDegradedListener = jest.fn();
            const policy = createServicePolicy();
            policy.onDegraded(onDegradedListener);

            const promise = policy.execute(mockService);
            // It's safe not to await this promise; adding it to the promise
            // queue is enough to prevent this test from running indefinitely.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            jest.runAllTimersAsync();
            await ignoreRejection(promise);

            expect(onDegradedListener).toHaveBeenCalledTimes(1);
            expect(onDegradedListener).toHaveBeenCalledWith({ error });
          });

          it('does not call onAvailable listeners', async () => {
            const error = new Error('failure');
            const mockService = jest.fn(() => {
              throw error;
            });
            const onAvailableListener = jest.fn();
            const policy = createServicePolicy();
            policy.onAvailable(onAvailableListener);

            const promise = policy.execute(mockService);
            // It's safe not to await this promise; adding it to the promise
            // queue is enough to prevent this test from running indefinitely.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            jest.runAllTimersAsync();
            await ignoreRejection(promise);

            expect(onAvailableListener).not.toHaveBeenCalled();
          });
        });

        describe('using a custom max number of consecutive failures', () => {
          describe('if the initial run + retries is less than the max number of consecutive failures', () => {
            it('throws what the service throws', async () => {
              const maxConsecutiveFailures = DEFAULT_MAX_RETRIES + 2;
              const error = new Error('failure');
              const mockService = jest.fn(() => {
                throw error;
              });
              const policy = createServicePolicy({
                maxConsecutiveFailures,
              });

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();

              await expect(promise).rejects.toThrow(error);
            });

            it('does not call onBreak listeners', async () => {
              const maxConsecutiveFailures = DEFAULT_MAX_RETRIES + 2;
              const error = new Error('failure');
              const mockService = jest.fn(() => {
                throw error;
              });
              const onBreakListener = jest.fn();
              const policy = createServicePolicy({
                maxConsecutiveFailures,
              });

              policy.onBreak(onBreakListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();
              await ignoreRejection(promise);

              expect(onBreakListener).not.toHaveBeenCalled();
            });

            it('calls onDegraded listeners once with the error', async () => {
              const maxConsecutiveFailures = DEFAULT_MAX_RETRIES + 2;
              const error = new Error('failure');
              const mockService = jest.fn(() => {
                throw error;
              });
              const onDegradedListener = jest.fn();
              const policy = createServicePolicy({
                maxConsecutiveFailures,
              });
              policy.onDegraded(onDegradedListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();
              await ignoreRejection(promise);

              expect(onDegradedListener).toHaveBeenCalledTimes(1);
              expect(onDegradedListener).toHaveBeenCalledWith({ error });
            });

            it('does not call onAvailable listeners', async () => {
              const maxConsecutiveFailures = DEFAULT_MAX_RETRIES + 2;
              const error = new Error('failure');
              const mockService = jest.fn(() => {
                throw error;
              });
              const onAvailableListener = jest.fn();
              const policy = createServicePolicy({
                maxConsecutiveFailures,
              });
              policy.onAvailable(onAvailableListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();
              await ignoreRejection(promise);

              expect(onAvailableListener).not.toHaveBeenCalled();
            });
          });

          describe('if the initial run + retries is equal to the max number of consecutive failures', () => {
            it('throws what the service throws', async () => {
              const maxConsecutiveFailures = DEFAULT_MAX_RETRIES + 1;
              const error = new Error('failure');
              const mockService = jest.fn(() => {
                throw error;
              });
              const policy = createServicePolicy({
                maxConsecutiveFailures,
              });

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();

              await expect(promise).rejects.toThrow(error);
            });

            it('calls onBreak listeners once with the error', async () => {
              const maxConsecutiveFailures = DEFAULT_MAX_RETRIES + 1;
              const error = new Error('failure');
              const mockService = jest.fn(() => {
                throw error;
              });
              const onBreakListener = jest.fn();
              const policy = createServicePolicy({
                maxConsecutiveFailures,
              });

              policy.onBreak(onBreakListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();
              await ignoreRejection(promise);

              expect(onBreakListener).toHaveBeenCalledTimes(1);
              expect(onBreakListener).toHaveBeenCalledWith({ error });
            });

            it('never calls onDegraded listeners, since the circuit is open', async () => {
              const maxConsecutiveFailures = DEFAULT_MAX_RETRIES + 1;
              const error = new Error('failure');
              const mockService = jest.fn(() => {
                throw error;
              });
              const onDegradedListener = jest.fn();
              const policy = createServicePolicy({
                maxConsecutiveFailures,
              });
              policy.onDegraded(onDegradedListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();
              await ignoreRejection(promise);

              expect(onDegradedListener).not.toHaveBeenCalled();
            });

            it('does not call onAvailable listeners', async () => {
              const maxConsecutiveFailures = DEFAULT_MAX_RETRIES + 1;
              const error = new Error('failure');
              const mockService = jest.fn(() => {
                throw error;
              });
              const onAvailableListener = jest.fn();
              const policy = createServicePolicy({
                maxConsecutiveFailures,
              });
              policy.onAvailable(onAvailableListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();
              await ignoreRejection(promise);

              expect(onAvailableListener).not.toHaveBeenCalled();
            });

            it('throws a BrokenCircuitError instead of whatever error the service produces if the service is executed again', async () => {
              const maxConsecutiveFailures = DEFAULT_MAX_RETRIES + 1;
              const error = new Error('failure');
              const mockService = jest.fn(() => {
                throw error;
              });
              const policy = createServicePolicy({
                maxConsecutiveFailures,
              });

              const firstExecution = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();
              await ignoreRejection(firstExecution);

              const secondExecution = policy.execute(mockService);
              await expect(secondExecution).rejects.toThrow(
                new Error(
                  'Execution prevented because the circuit breaker is open',
                ),
              );
            });
          });

          describe('if the initial run + retries is greater than the max number of consecutive failures', () => {
            it('throws a BrokenCircuitError instead of whatever error the service produces', async () => {
              const maxConsecutiveFailures = DEFAULT_MAX_RETRIES;
              const error = new Error('failure');
              const mockService = jest.fn(() => {
                throw error;
              });
              const policy = createServicePolicy({
                maxConsecutiveFailures,
              });

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();

              await expect(promise).rejects.toThrow(
                new Error(
                  'Execution prevented because the circuit breaker is open',
                ),
              );
            });

            it('calls onBreak listeners once with the error', async () => {
              const maxConsecutiveFailures = DEFAULT_MAX_RETRIES;
              const error = new Error('failure');
              const mockService = jest.fn(() => {
                throw error;
              });
              const onBreakListener = jest.fn();
              const policy = createServicePolicy({
                maxConsecutiveFailures,
              });

              policy.onBreak(onBreakListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();
              await ignoreRejection(promise);

              expect(onBreakListener).toHaveBeenCalledTimes(1);
              expect(onBreakListener).toHaveBeenCalledWith({ error });
            });

            it('never calls onDegraded listeners, since the circuit is open', async () => {
              const maxConsecutiveFailures = DEFAULT_MAX_RETRIES;
              const error = new Error('failure');
              const mockService = jest.fn(() => {
                throw error;
              });
              const onDegradedListener = jest.fn();
              const policy = createServicePolicy({
                maxConsecutiveFailures,
              });
              policy.onDegraded(onDegradedListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();
              await ignoreRejection(promise);

              expect(onDegradedListener).not.toHaveBeenCalled();
            });

            it('does not call onAvailable listeners', async () => {
              const maxConsecutiveFailures = DEFAULT_MAX_RETRIES;
              const error = new Error('failure');
              const mockService = jest.fn(() => {
                throw error;
              });
              const onAvailableListener = jest.fn();
              const policy = createServicePolicy({
                maxConsecutiveFailures,
              });
              policy.onAvailable(onAvailableListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();
              await ignoreRejection(promise);

              expect(onAvailableListener).not.toHaveBeenCalled();
            });
          });
        });
      });

      describe('using a custom max number of retries', () => {
        it(`calls the service a total of 1 + <maxRetries> times, delaying each retry using a backoff formula`, async () => {
          const maxRetries = 5;
          const error = new Error('failure');
          const mockService = jest.fn(() => {
            throw error;
          });
          const policy = createServicePolicy({ maxRetries });
          // Each retry delay is randomized using a decorrelated jitter formula,
          // so we need to prevent that
          jest.spyOn(Math, 'random').mockReturnValue(0);

          const promise = policy.execute(mockService);
          // It's safe not to await these promises; adding them to the promise
          // queue is enough to prevent this test from running indefinitely.
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          jest.advanceTimersByTimeAsync(0);
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          jest.advanceTimersByTimeAsync(176.27932892814937);
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          jest.advanceTimersByTimeAsync(186.8886145345685);
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          jest.advanceTimersByTimeAsync(366.8287823691078);
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          jest.advanceTimersByTimeAsync(731.8792783578953);
          await ignoreRejection(promise);

          expect(mockService).toHaveBeenCalledTimes(1 + maxRetries);
        });

        it('calls onRetry listeners once per retry', async () => {
          const maxRetries = 5;
          const error = new Error('failure');
          const mockService = jest.fn(() => {
            throw error;
          });
          const onRetryListener = jest.fn();
          const policy = createServicePolicy({
            maxRetries,
          });
          policy.onRetry(onRetryListener);

          const promise = policy.execute(mockService);
          // It's safe not to await this promise; adding it to the promise queue is
          // enough to prevent this test from running indefinitely.
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          jest.runAllTimersAsync();
          await ignoreRejection(promise);

          expect(onRetryListener).toHaveBeenCalledTimes(maxRetries);
        });

        describe(`using the default max number of consecutive failures (${DEFAULT_MAX_CONSECUTIVE_FAILURES})`, () => {
          describe('if the initial run + retries is less than the max number of consecutive failures', () => {
            it('throws what the service throws', async () => {
              const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES - 2;
              const error = new Error('failure');
              const mockService = jest.fn(() => {
                throw error;
              });
              const policy = createServicePolicy({ maxRetries });

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();

              await expect(promise).rejects.toThrow(error);
            });

            it('does not call onBreak listeners', async () => {
              const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES - 2;
              const error = new Error('failure');
              const mockService = jest.fn(() => {
                throw error;
              });
              const onBreakListener = jest.fn();
              const policy = createServicePolicy({ maxRetries });

              policy.onBreak(onBreakListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();
              await ignoreRejection(promise);

              expect(onBreakListener).not.toHaveBeenCalled();
            });

            it('calls onDegraded listeners once with the error', async () => {
              const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES - 2;
              const error = new Error('failure');
              const mockService = jest.fn(() => {
                throw error;
              });
              const onDegradedListener = jest.fn();
              const policy = createServicePolicy({ maxRetries });
              policy.onDegraded(onDegradedListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();
              await ignoreRejection(promise);

              expect(onDegradedListener).toHaveBeenCalledTimes(1);
              expect(onDegradedListener).toHaveBeenCalledWith({ error });
            });

            it('does not call onAvailable listeners', async () => {
              const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES - 2;
              const error = new Error('failure');
              const mockService = jest.fn(() => {
                throw error;
              });
              const onAvailableListener = jest.fn();
              const policy = createServicePolicy({ maxRetries });
              policy.onAvailable(onAvailableListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();
              await ignoreRejection(promise);

              expect(onAvailableListener).not.toHaveBeenCalled();
            });
          });

          describe('if the initial run + retries is equal to the max number of consecutive failures', () => {
            it('throws what the service throws', async () => {
              const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES - 1;
              const error = new Error('failure');
              const mockService = jest.fn(() => {
                throw error;
              });
              const policy = createServicePolicy({ maxRetries });

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();

              await expect(promise).rejects.toThrow(error);
            });

            it('calls onBreak listeners once with the error', async () => {
              const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES - 1;
              const error = new Error('failure');
              const mockService = jest.fn(() => {
                throw error;
              });
              const onBreakListener = jest.fn();
              const policy = createServicePolicy({ maxRetries });

              policy.onBreak(onBreakListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();
              await ignoreRejection(promise);

              expect(onBreakListener).toHaveBeenCalledTimes(1);
              expect(onBreakListener).toHaveBeenCalledWith({ error });
            });

            it('never calls onDegraded listeners, since the circuit is open', async () => {
              const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES - 1;
              const error = new Error('failure');
              const mockService = jest.fn(() => {
                throw error;
              });
              const onDegradedListener = jest.fn();
              const policy = createServicePolicy({ maxRetries });
              policy.onDegraded(onDegradedListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();
              await ignoreRejection(promise);

              expect(onDegradedListener).not.toHaveBeenCalled();
            });

            it('does not call onAvailable listeners', async () => {
              const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES - 1;
              const error = new Error('failure');
              const mockService = jest.fn(() => {
                throw error;
              });
              const onAvailableListener = jest.fn();
              const policy = createServicePolicy({ maxRetries });
              policy.onAvailable(onAvailableListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();
              await ignoreRejection(promise);

              expect(onAvailableListener).not.toHaveBeenCalled();
            });

            it('throws a BrokenCircuitError instead of whatever error the service produces if the policy is executed again', async () => {
              const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES - 1;
              const error = new Error('failure');
              const mockService = jest.fn(() => {
                throw error;
              });
              const policy = createServicePolicy({ maxRetries });

              const firstExecution = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();
              await ignoreRejection(firstExecution);

              const secondExecution = policy.execute(mockService);
              await expect(secondExecution).rejects.toThrow(
                new Error(
                  'Execution prevented because the circuit breaker is open',
                ),
              );
            });
          });

          describe('if the initial run + retries is greater than the max number of consecutive failures', () => {
            it('throws a BrokenCircuitError instead of whatever error the service produces', async () => {
              const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES;
              const mockService = jest.fn(() => {
                throw new Error('failure');
              });
              const policy = createServicePolicy({ maxRetries });

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();

              await expect(promise).rejects.toThrow(
                new Error(
                  'Execution prevented because the circuit breaker is open',
                ),
              );
            });

            it('calls onBreak listeners once with the error', async () => {
              const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES;
              const error = new Error('failure');
              const mockService = jest.fn(() => {
                throw error;
              });
              const onBreakListener = jest.fn();
              const policy = createServicePolicy({ maxRetries });

              policy.onBreak(onBreakListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();
              await ignoreRejection(promise);

              expect(onBreakListener).toHaveBeenCalledTimes(1);
              expect(onBreakListener).toHaveBeenCalledWith({ error });
            });

            it('never calls onDegraded listeners, since the circuit is open', async () => {
              const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES;
              const error = new Error('failure');
              const mockService = jest.fn(() => {
                throw error;
              });
              const onDegradedListener = jest.fn();
              const policy = createServicePolicy({ maxRetries });
              policy.onDegraded(onDegradedListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();
              await ignoreRejection(promise);

              expect(onDegradedListener).not.toHaveBeenCalled();
            });

            it('does not call onAvailable listeners', async () => {
              const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES;
              const error = new Error('failure');
              const mockService = jest.fn(() => {
                throw error;
              });
              const onAvailableListener = jest.fn();
              const policy = createServicePolicy({ maxRetries });
              policy.onAvailable(onAvailableListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();
              await ignoreRejection(promise);

              expect(onAvailableListener).not.toHaveBeenCalled();
            });
          });
        });

        describe('using a custom max number of consecutive failures', () => {
          describe('if the initial run + retries is less than the max number of consecutive failures', () => {
            it('throws what the service throws', async () => {
              const maxConsecutiveFailures = 5;
              const maxRetries = maxConsecutiveFailures - 2;
              const error = new Error('failure');
              const mockService = jest.fn(() => {
                throw error;
              });
              const policy = createServicePolicy({
                maxRetries,
                maxConsecutiveFailures,
              });

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();

              await expect(promise).rejects.toThrow(error);
            });

            it('does not call onBreak listeners', async () => {
              const maxConsecutiveFailures = 5;
              const maxRetries = maxConsecutiveFailures - 2;
              const error = new Error('failure');
              const mockService = jest.fn(() => {
                throw error;
              });
              const onBreakListener = jest.fn();
              const policy = createServicePolicy({
                maxRetries,
                maxConsecutiveFailures,
              });

              policy.onBreak(onBreakListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();
              await ignoreRejection(promise);

              expect(onBreakListener).not.toHaveBeenCalled();
            });

            it('calls onDegraded listeners once with the error', async () => {
              const maxConsecutiveFailures = 5;
              const maxRetries = maxConsecutiveFailures - 2;
              const error = new Error('failure');
              const mockService = jest.fn(() => {
                throw error;
              });
              const onDegradedListener = jest.fn();
              const policy = createServicePolicy({
                maxRetries,
                maxConsecutiveFailures,
              });
              policy.onDegraded(onDegradedListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();
              await ignoreRejection(promise);

              expect(onDegradedListener).toHaveBeenCalledTimes(1);
              expect(onDegradedListener).toHaveBeenCalledWith({ error });
            });

            it('does not call onAvailable listeners', async () => {
              const maxConsecutiveFailures = 5;
              const maxRetries = maxConsecutiveFailures - 2;
              const error = new Error('failure');
              const mockService = jest.fn(() => {
                throw error;
              });
              const onAvailableListener = jest.fn();
              const policy = createServicePolicy({
                maxRetries,
                maxConsecutiveFailures,
              });
              policy.onAvailable(onAvailableListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();
              await ignoreRejection(promise);

              expect(onAvailableListener).not.toHaveBeenCalled();
            });
          });

          describe('if the initial run + retries is equal to the max number of consecutive failures', () => {
            it('throws what the service throws', async () => {
              const maxConsecutiveFailures = 5;
              const maxRetries = maxConsecutiveFailures - 1;
              const error = new Error('failure');
              const mockService = jest.fn(() => {
                throw error;
              });
              const policy = createServicePolicy({
                maxRetries,
                maxConsecutiveFailures,
              });

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();

              await expect(promise).rejects.toThrow(error);
            });

            it('calls onBreak listeners once with the error', async () => {
              const maxConsecutiveFailures = 5;
              const maxRetries = maxConsecutiveFailures - 1;
              const error = new Error('failure');
              const mockService = jest.fn(() => {
                throw error;
              });
              const onBreakListener = jest.fn();
              const policy = createServicePolicy({
                maxRetries,
                maxConsecutiveFailures,
              });

              policy.onBreak(onBreakListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();
              await ignoreRejection(promise);

              expect(onBreakListener).toHaveBeenCalledTimes(1);
              expect(onBreakListener).toHaveBeenCalledWith({ error });
            });

            it('never calls onDegraded listeners, since the circuit is open', async () => {
              const maxConsecutiveFailures = 5;
              const maxRetries = maxConsecutiveFailures - 1;
              const error = new Error('failure');
              const mockService = jest.fn(() => {
                throw error;
              });
              const onDegradedListener = jest.fn();
              const policy = createServicePolicy({
                maxRetries,
                maxConsecutiveFailures,
              });
              policy.onDegraded(onDegradedListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();
              await ignoreRejection(promise);

              expect(onDegradedListener).not.toHaveBeenCalled();
            });

            it('never calls onAvailable listeners', async () => {
              const maxConsecutiveFailures = 5;
              const maxRetries = maxConsecutiveFailures - 1;
              const error = new Error('failure');
              const mockService = jest.fn(() => {
                throw error;
              });
              const onAvailableListener = jest.fn();
              const policy = createServicePolicy({
                maxRetries,
                maxConsecutiveFailures,
              });
              policy.onAvailable(onAvailableListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();
              await ignoreRejection(promise);

              expect(onAvailableListener).not.toHaveBeenCalled();
            });

            it('throws a BrokenCircuitError instead of whatever error the service produces if the policy is executed again', async () => {
              const maxConsecutiveFailures = 5;
              const maxRetries = maxConsecutiveFailures - 1;
              const error = new Error('failure');
              const mockService = jest.fn(() => {
                throw error;
              });
              const policy = createServicePolicy({
                maxRetries,
                maxConsecutiveFailures,
              });

              const firstExecution = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();
              await ignoreRejection(firstExecution);

              const secondExecution = policy.execute(mockService);
              await expect(secondExecution).rejects.toThrow(
                new Error(
                  'Execution prevented because the circuit breaker is open',
                ),
              );
            });
          });

          describe('if the initial run + retries is greater than the max number of consecutive failures', () => {
            it('throws a BrokenCircuitError instead of whatever error the service produces', async () => {
              const maxConsecutiveFailures = 5;
              const maxRetries = maxConsecutiveFailures;
              const error = new Error('failure');
              const mockService = jest.fn(() => {
                throw error;
              });
              const policy = createServicePolicy({
                maxRetries,
                maxConsecutiveFailures,
              });

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();

              await expect(promise).rejects.toThrow(
                new Error(
                  'Execution prevented because the circuit breaker is open',
                ),
              );
            });

            it('calls onBreak listeners once with the error', async () => {
              const maxConsecutiveFailures = 5;
              const maxRetries = maxConsecutiveFailures;
              const error = new Error('failure');
              const mockService = jest.fn(() => {
                throw error;
              });
              const onBreakListener = jest.fn();
              const policy = createServicePolicy({
                maxRetries,
                maxConsecutiveFailures,
              });

              policy.onBreak(onBreakListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();
              await ignoreRejection(promise);

              expect(onBreakListener).toHaveBeenCalledTimes(1);
              expect(onBreakListener).toHaveBeenCalledWith({ error });
            });

            it('never calls onDegraded listeners, since the circuit is open', async () => {
              const maxConsecutiveFailures = 5;
              const maxRetries = maxConsecutiveFailures;
              const error = new Error('failure');
              const mockService = jest.fn(() => {
                throw error;
              });
              const onDegradedListener = jest.fn();
              const policy = createServicePolicy({
                maxRetries,
                maxConsecutiveFailures,
              });
              policy.onDegraded(onDegradedListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();
              await ignoreRejection(promise);

              expect(onDegradedListener).not.toHaveBeenCalled();
            });

            it('does not call onAvailable listeners', async () => {
              const maxConsecutiveFailures = 5;
              const maxRetries = maxConsecutiveFailures;
              const error = new Error('failure');
              const mockService = jest.fn(() => {
                throw error;
              });
              const onAvailableListener = jest.fn();
              const policy = createServicePolicy({
                maxRetries,
                maxConsecutiveFailures,
              });
              policy.onAvailable(onAvailableListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();
              await ignoreRejection(promise);

              expect(onAvailableListener).not.toHaveBeenCalled();
            });
          });
        });
      });
    });
  });

  describe('wrapping a service that fails continuously and then succeeds on the final try', () => {
    // NOTE: Using a custom retry filter policy is not tested here since the
    // same thing would happen as above if the error is filtered out

    describe(`using the default max retries (${DEFAULT_MAX_RETRIES})`, () => {
      it(`calls the service a total of ${
        1 + DEFAULT_MAX_RETRIES
      } times, delaying each retry using a backoff formula`, async () => {
        let invocationCounter = 0;
        const mockService = jest.fn(() => {
          invocationCounter += 1;
          if (invocationCounter === DEFAULT_MAX_RETRIES + 1) {
            return { some: 'data' };
          }
          throw new Error('failure');
        });
        const policy = createServicePolicy();
        // Each retry delay is randomized using a decorrelated jitter formula,
        // so we need to prevent that
        jest.spyOn(Math, 'random').mockReturnValue(0);

        const promise = policy.execute(mockService);
        // It's safe not to await these promises; adding them to the promise
        // queue is enough to prevent this test from running indefinitely.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        jest.advanceTimersByTimeAsync(0);
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        jest.advanceTimersByTimeAsync(176.27932892814937);
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        jest.advanceTimersByTimeAsync(186.8886145345685);
        await promise;

        expect(mockService).toHaveBeenCalledTimes(1 + DEFAULT_MAX_RETRIES);
      });

      describe(`using the default max number of consecutive failures (${DEFAULT_MAX_CONSECUTIVE_FAILURES})`, () => {
        it('returns what the service returns', async () => {
          let invocationCounter = 0;
          const mockService = (): { some: string } => {
            invocationCounter += 1;
            if (invocationCounter === DEFAULT_MAX_RETRIES + 1) {
              return { some: 'data' };
            }
            throw new Error('failure');
          };
          const policy = createServicePolicy();

          const promise = policy.execute(mockService);
          // It's safe not to await this promise; adding it to the promise queue
          // is enough to prevent this test from running indefinitely.
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          jest.runAllTimersAsync();

          expect(await promise).toStrictEqual({ some: 'data' });
        });

        it('does not call onBreak listeners, since the max number of consecutive failures is never reached', async () => {
          let invocationCounter = 0;
          const mockService = (): { some: string } => {
            invocationCounter += 1;
            if (invocationCounter === DEFAULT_MAX_RETRIES + 1) {
              return { some: 'data' };
            }
            throw new Error('failure');
          };
          const onBreakListener = jest.fn();
          const policy = createServicePolicy();

          policy.onBreak(onBreakListener);

          const promise = policy.execute(mockService);
          // It's safe not to await this promise; adding it to the promise queue
          // is enough to prevent this test from running indefinitely.
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          jest.runAllTimersAsync();
          await promise;

          expect(onBreakListener).not.toHaveBeenCalled();
        });

        describe.each([
          {
            desc: `the default degraded threshold (${DEFAULT_DEGRADED_THRESHOLD})`,
            threshold: DEFAULT_DEGRADED_THRESHOLD,
            options: {},
          },
          {
            desc: 'a custom degraded threshold',
            threshold: 2000,
            options: { degradedThreshold: 2000 },
          },
        ])('using $desc', ({ threshold, options }) => {
          describe('if the service execution time is below the threshold', () => {
            it('does not call onDegraded listeners', async () => {
              let invocationCounter = 0;
              const mockService = (): { some: string } => {
                invocationCounter += 1;
                if (invocationCounter === DEFAULT_MAX_RETRIES + 1) {
                  return { some: 'data' };
                }
                throw new Error('failure');
              };
              const onDegradedListener = jest.fn();
              const policy = createServicePolicy(options);
              policy.onDegraded(onDegradedListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();
              await promise;

              expect(onDegradedListener).not.toHaveBeenCalled();
            });

            it('calls onAvailable listeners once, even if the service is called more than once', async () => {
              let invocationCounter = 0;
              const mockService = (): { some: string } => {
                invocationCounter += 1;
                if (
                  invocationCounter > 0 &&
                  invocationCounter % (DEFAULT_MAX_RETRIES + 1) === 0
                ) {
                  return { some: 'data' };
                }
                throw new Error('failure');
              };
              const onAvailableListener = jest.fn();
              const policy = createServicePolicy(options);
              policy.onAvailable(onAvailableListener);

              const promise1 = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();
              await promise1;
              const promise2 = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();
              await promise2;

              expect(onAvailableListener).toHaveBeenCalledTimes(1);
            });
          });

          describe('if the service execution time is beyond the threshold', () => {
            it('calls onDegraded listeners once', async () => {
              let invocationCounter = 0;
              const delay = threshold + 1;
              const mockService = (): Promise<{ some: string }> => {
                invocationCounter += 1;
                return new Promise((resolve, reject) => {
                  if (invocationCounter === DEFAULT_MAX_RETRIES + 1) {
                    setTimeout(() => resolve({ some: 'data' }), delay);
                  } else {
                    reject(new Error('failure'));
                  }
                });
              };
              const onDegradedListener = jest.fn();
              const policy = createServicePolicy(options);
              policy.onDegraded(onDegradedListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();
              await promise;

              expect(onDegradedListener).toHaveBeenCalledTimes(1);
            });

            it('does not call onAvailable listeners', async () => {
              let invocationCounter = 0;
              const delay = DEFAULT_DEGRADED_THRESHOLD + 1;
              const mockService = (): Promise<{ some: string }> => {
                invocationCounter += 1;
                return new Promise((resolve, reject) => {
                  if (invocationCounter === DEFAULT_MAX_RETRIES + 1) {
                    setTimeout(() => resolve({ some: 'data' }), delay);
                  } else {
                    reject(new Error('failure'));
                  }
                });
              };
              const onAvailableListener = jest.fn();
              const policy = createServicePolicy(options);
              policy.onAvailable(onAvailableListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              jest.runAllTimersAsync();
              await promise;

              expect(onAvailableListener).not.toHaveBeenCalled();
            });
          });
        });
      });

      describe('using a custom max number of consecutive failures', () => {
        describe('if the initial run + retries is less than the max number of consecutive failures', () => {
          it('returns what the service returns', async () => {
            const maxConsecutiveFailures = DEFAULT_MAX_RETRIES + 2;
            let invocationCounter = 0;
            const mockService = (): { some: string } => {
              invocationCounter += 1;
              if (invocationCounter === DEFAULT_MAX_RETRIES + 1) {
                return { some: 'data' };
              }
              throw new Error('failure');
            };
            const policy = createServicePolicy({
              maxConsecutiveFailures,
            });

            const promise = policy.execute(mockService);
            // It's safe not to await this promise; adding it to the promise
            // queue is enough to prevent this test from running indefinitely.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            jest.runAllTimersAsync();

            expect(await promise).toStrictEqual({ some: 'data' });
          });

          it('does not call onBreak listeners', async () => {
            const maxConsecutiveFailures = DEFAULT_MAX_RETRIES + 2;
            let invocationCounter = 0;
            const mockService = (): { some: string } => {
              invocationCounter += 1;
              if (invocationCounter === DEFAULT_MAX_RETRIES + 1) {
                return { some: 'data' };
              }
              throw new Error('failure');
            };
            const onBreakListener = jest.fn();
            const policy = createServicePolicy({
              maxConsecutiveFailures,
            });

            policy.onBreak(onBreakListener);

            const promise = policy.execute(mockService);
            // It's safe not to await this promise; adding it to the promise
            // queue is enough to prevent this test from running indefinitely.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            jest.runAllTimersAsync();
            await promise;

            expect(onBreakListener).not.toHaveBeenCalled();
          });

          describe.each([
            {
              desc: `the default degraded threshold (${DEFAULT_DEGRADED_THRESHOLD})`,
              threshold: DEFAULT_DEGRADED_THRESHOLD,
              options: {},
            },
            {
              desc: 'a custom degraded threshold',
              threshold: 2000,
              options: { degradedThreshold: 2000 },
            },
          ])('using $desc', ({ threshold, options }) => {
            describe('if the service execution time is below the threshold', () => {
              it('does not call onDegraded listeners', async () => {
                const maxConsecutiveFailures = DEFAULT_MAX_RETRIES + 2;
                let invocationCounter = 0;
                const mockService = (): { some: string } => {
                  invocationCounter += 1;
                  if (invocationCounter === DEFAULT_MAX_RETRIES + 1) {
                    return { some: 'data' };
                  }
                  throw new Error('failure');
                };
                const onDegradedListener = jest.fn();
                const policy = createServicePolicy({
                  maxConsecutiveFailures,
                  ...options,
                });
                policy.onDegraded(onDegradedListener);

                const promise = policy.execute(mockService);
                // It's safe not to await this promise; adding it to the promise
                // queue is enough to prevent this test from running indefinitely.
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                jest.runAllTimersAsync();
                await promise;

                expect(onDegradedListener).not.toHaveBeenCalled();
              });

              it('calls onAvailable listeners once, even if the service is called more than once', async () => {
                const maxConsecutiveFailures = DEFAULT_MAX_RETRIES + 2;
                let invocationCounter = 0;
                const mockService = (): { some: string } => {
                  invocationCounter += 1;
                  if (invocationCounter >= DEFAULT_MAX_RETRIES + 1) {
                    return { some: 'data' };
                  }
                  throw new Error('failure');
                };
                const onAvailableListener = jest.fn();
                const policy = createServicePolicy({
                  maxConsecutiveFailures,
                  ...options,
                });
                policy.onAvailable(onAvailableListener);

                const promise1 = policy.execute(mockService);
                // It's safe not to await this promise; adding it to the promise
                // queue is enough to prevent this test from running indefinitely.
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                jest.runAllTimersAsync();
                await promise1;
                const promise2 = policy.execute(mockService);
                // It's safe not to await this promise; adding it to the promise
                // queue is enough to prevent this test from running indefinitely.
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                jest.runAllTimersAsync();
                await promise2;

                expect(onAvailableListener).toHaveBeenCalledTimes(1);
              });
            });

            describe('if the service execution time is beyond the threshold', () => {
              it('calls onDegraded listeners once', async () => {
                const maxConsecutiveFailures = DEFAULT_MAX_RETRIES + 2;
                const delay = threshold + 1;
                let invocationCounter = 0;
                const mockService = (): Promise<{ some: string }> => {
                  invocationCounter += 1;
                  return new Promise((resolve, reject) => {
                    if (invocationCounter === DEFAULT_MAX_RETRIES + 1) {
                      setTimeout(() => resolve({ some: 'data' }), delay);
                    } else {
                      reject(new Error('failure'));
                    }
                  });
                };
                const onDegradedListener = jest.fn();
                const policy = createServicePolicy({
                  maxConsecutiveFailures,
                  ...options,
                });
                policy.onDegraded(onDegradedListener);

                const promise = policy.execute(mockService);
                // It's safe not to await this promise; adding it to the promise
                // queue is enough to prevent this test from running indefinitely.
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                jest.runAllTimersAsync();
                await promise;

                expect(onDegradedListener).toHaveBeenCalledTimes(1);
              });

              it('does not call onAvailable listeners', async () => {
                const maxConsecutiveFailures = DEFAULT_MAX_RETRIES + 2;
                const delay = threshold + 1;
                let invocationCounter = 0;
                const mockService = (): Promise<{ some: string }> => {
                  invocationCounter += 1;
                  return new Promise((resolve, reject) => {
                    if (invocationCounter === DEFAULT_MAX_RETRIES + 1) {
                      setTimeout(() => resolve({ some: 'data' }), delay);
                    } else {
                      reject(new Error('failure'));
                    }
                  });
                };
                const onAvailableListener = jest.fn();
                const policy = createServicePolicy({
                  maxConsecutiveFailures,
                  ...options,
                });
                policy.onAvailable(onAvailableListener);

                const promise = policy.execute(mockService);
                // It's safe not to await this promise; adding it to the promise
                // queue is enough to prevent this test from running indefinitely.
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                jest.runAllTimersAsync();
                await promise;

                expect(onAvailableListener).not.toHaveBeenCalled();
              });
            });
          });
        });

        describe('if the initial run + retries is equal to the max number of consecutive failures', () => {
          it('returns what the service returns', async () => {
            const maxConsecutiveFailures = DEFAULT_MAX_RETRIES + 1;
            let invocationCounter = 0;
            const mockService = (): { some: string } => {
              invocationCounter += 1;
              if (invocationCounter === DEFAULT_MAX_RETRIES + 1) {
                return { some: 'data' };
              }
              throw new Error('failure');
            };
            const policy = createServicePolicy({
              maxConsecutiveFailures,
            });

            const promise = policy.execute(mockService);
            // It's safe not to await this promise; adding it to the promise
            // queue is enough to prevent this test from running indefinitely.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            jest.runAllTimersAsync();

            expect(await promise).toStrictEqual({ some: 'data' });
          });

          it('does not call onBreak listeners', async () => {
            const maxConsecutiveFailures = DEFAULT_MAX_RETRIES + 1;
            let invocationCounter = 0;
            const error = new Error('failure');
            const mockService = (): { some: string } => {
              invocationCounter += 1;
              if (invocationCounter === DEFAULT_MAX_RETRIES + 1) {
                return { some: 'data' };
              }
              throw error;
            };
            const onBreakListener = jest.fn();
            const policy = createServicePolicy({
              maxConsecutiveFailures,
            });

            policy.onBreak(onBreakListener);

            const promise = policy.execute(mockService);
            // It's safe not to await this promise; adding it to the promise
            // queue is enough to prevent this test from running indefinitely.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            jest.runAllTimersAsync();
            await promise;

            expect(onBreakListener).not.toHaveBeenCalled();
          });

          describe.each([
            {
              desc: `the default degraded threshold (${DEFAULT_DEGRADED_THRESHOLD})`,
              threshold: DEFAULT_DEGRADED_THRESHOLD,
              options: {},
            },
            {
              desc: 'a custom degraded threshold',
              threshold: 2000,
              options: { degradedThreshold: 2000 },
            },
          ])('using $desc', ({ threshold, options }) => {
            describe('if the service execution time is below the threshold', () => {
              it('does not call onDegraded listeners', async () => {
                const maxConsecutiveFailures = DEFAULT_MAX_RETRIES + 1;
                let invocationCounter = 0;
                const error = new Error('failure');
                const mockService = (): { some: string } => {
                  invocationCounter += 1;
                  if (invocationCounter === DEFAULT_MAX_RETRIES + 1) {
                    return { some: 'data' };
                  }
                  throw error;
                };
                const onDegradedListener = jest.fn();
                const policy = createServicePolicy({
                  maxConsecutiveFailures,
                  ...options,
                });
                policy.onDegraded(onDegradedListener);

                const promise = policy.execute(mockService);
                // It's safe not to await this promise; adding it to the promise
                // queue is enough to prevent this test from running indefinitely.
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                jest.runAllTimersAsync();
                await promise;

                expect(onDegradedListener).not.toHaveBeenCalled();
              });

              it('calls onAvailable listeners once, even if the service is called more than once', async () => {
                const maxConsecutiveFailures = DEFAULT_MAX_RETRIES + 1;
                let invocationCounter = 0;
                const error = new Error('failure');
                const mockService = (): { some: string } => {
                  invocationCounter += 1;
                  if (invocationCounter >= DEFAULT_MAX_RETRIES + 1) {
                    return { some: 'data' };
                  }
                  throw error;
                };
                const onAvailableListener = jest.fn();
                const policy = createServicePolicy({
                  maxConsecutiveFailures,
                  ...options,
                });
                policy.onAvailable(onAvailableListener);

                const promise1 = policy.execute(mockService);
                // It's safe not to await this promise; adding it to the promise
                // queue is enough to prevent this test from running indefinitely.
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                jest.runAllTimersAsync();
                await promise1;
                const promise2 = policy.execute(mockService);
                // It's safe not to await this promise; adding it to the promise
                // queue is enough to prevent this test from running indefinitely.
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                jest.runAllTimersAsync();
                await promise2;

                expect(onAvailableListener).toHaveBeenCalledTimes(1);
              });
            });

            describe('if the service execution time is beyond the threshold', () => {
              it('calls onDegraded listeners once', async () => {
                const maxConsecutiveFailures = DEFAULT_MAX_RETRIES + 1;
                const delay = threshold + 1;
                let invocationCounter = 0;
                const mockService = (): Promise<{ some: string }> => {
                  invocationCounter += 1;
                  return new Promise((resolve, reject) => {
                    if (invocationCounter === DEFAULT_MAX_RETRIES + 1) {
                      setTimeout(() => resolve({ some: 'data' }), delay);
                    } else {
                      reject(new Error('failure'));
                    }
                  });
                };
                const onDegradedListener = jest.fn();
                const policy = createServicePolicy({
                  maxConsecutiveFailures,
                  ...options,
                });
                policy.onDegraded(onDegradedListener);

                const promise = policy.execute(mockService);
                // It's safe not to await this promise; adding it to the promise
                // queue is enough to prevent this test from running indefinitely.
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                jest.runAllTimersAsync();
                await promise;

                expect(onDegradedListener).toHaveBeenCalledTimes(1);
              });

              it('does not call onAvailable listeners', async () => {
                const maxConsecutiveFailures = DEFAULT_MAX_RETRIES + 1;
                const delay = threshold + 1;
                let invocationCounter = 0;
                const mockService = (): Promise<{ some: string }> => {
                  invocationCounter += 1;
                  return new Promise((resolve, reject) => {
                    if (invocationCounter === DEFAULT_MAX_RETRIES + 1) {
                      setTimeout(() => resolve({ some: 'data' }), delay);
                    } else {
                      reject(new Error('failure'));
                    }
                  });
                };
                const onAvailableListener = jest.fn();
                const policy = createServicePolicy({
                  maxConsecutiveFailures,
                  ...options,
                });
                policy.onAvailable(onAvailableListener);

                const promise = policy.execute(mockService);
                // It's safe not to await this promise; adding it to the promise
                // queue is enough to prevent this test from running indefinitely.
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                jest.runAllTimersAsync();
                await promise;

                expect(onAvailableListener).not.toHaveBeenCalled();
              });
            });
          });
        });

        describe('if the initial run + retries is greater than the max number of consecutive failures', () => {
          it('throws a BrokenCircuitError before the service can succeed', async () => {
            const maxConsecutiveFailures = DEFAULT_MAX_RETRIES;
            let invocationCounter = 0;
            const error = new Error('failure');
            const mockService = (): { some: string } => {
              invocationCounter += 1;
              if (invocationCounter === DEFAULT_MAX_RETRIES + 1) {
                return { some: 'data' };
              }
              throw error;
            };
            const policy = createServicePolicy({
              maxConsecutiveFailures,
            });

            const promise = policy.execute(mockService);
            // It's safe not to await this promise; adding it to the promise
            // queue is enough to prevent this test from running indefinitely.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            jest.runAllTimersAsync();
            await expect(promise).rejects.toThrow(
              new Error(
                'Execution prevented because the circuit breaker is open',
              ),
            );
          });

          it('calls onBreak listeners once with the error', async () => {
            const maxConsecutiveFailures = DEFAULT_MAX_RETRIES;
            let invocationCounter = 0;
            const error = new Error('failure');
            const mockService = (): { some: string } => {
              invocationCounter += 1;
              if (invocationCounter === DEFAULT_MAX_RETRIES + 1) {
                return { some: 'data' };
              }
              throw error;
            };
            const onBreakListener = jest.fn();
            const policy = createServicePolicy({
              maxConsecutiveFailures,
            });

            policy.onBreak(onBreakListener);

            const promise = policy.execute(mockService);
            // It's safe not to await this promise; adding it to the promise
            // queue is enough to prevent this test from running indefinitely.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            jest.runAllTimersAsync();
            await ignoreRejection(promise);

            expect(onBreakListener).toHaveBeenCalledTimes(1);
            expect(onBreakListener).toHaveBeenCalledWith({ error });
          });

          it('does not call onDegraded listeners', async () => {
            const maxConsecutiveFailures = DEFAULT_MAX_RETRIES;
            let invocationCounter = 0;
            const error = new Error('failure');
            const mockService = (): { some: string } => {
              invocationCounter += 1;
              if (invocationCounter === DEFAULT_MAX_RETRIES + 1) {
                return { some: 'data' };
              }
              throw error;
            };
            const onDegradedListener = jest.fn();
            const policy = createServicePolicy({
              maxConsecutiveFailures,
            });
            policy.onDegraded(onDegradedListener);

            const promise = policy.execute(mockService);
            // It's safe not to await this promise; adding it to the promise
            // queue is enough to prevent this test from running indefinitely.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            jest.runAllTimersAsync();
            await ignoreRejection(promise);

            expect(onDegradedListener).not.toHaveBeenCalled();
          });

          it('does not call onAvailable listeners', async () => {
            const maxConsecutiveFailures = DEFAULT_MAX_RETRIES;
            let invocationCounter = 0;
            const error = new Error('failure');
            const mockService = (): { some: string } => {
              invocationCounter += 1;
              if (invocationCounter === DEFAULT_MAX_RETRIES + 1) {
                return { some: 'data' };
              }
              throw error;
            };
            const onAvailableListener = jest.fn();
            const policy = createServicePolicy({
              maxConsecutiveFailures,
            });
            policy.onAvailable(onAvailableListener);

            const promise = policy.execute(mockService);
            // It's safe not to await this promise; adding it to the promise
            // queue is enough to prevent this test from running indefinitely.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            jest.runAllTimersAsync();
            await ignoreRejection(promise);

            expect(onAvailableListener).not.toHaveBeenCalled();
          });

          describe('after the circuit break duration has elapsed', () => {
            describe.each([
              {
                desc: `the default circuit break duration (${DEFAULT_CIRCUIT_BREAK_DURATION})`,
                duration: DEFAULT_CIRCUIT_BREAK_DURATION,
                options: {},
              },
              {
                desc: 'a custom circuit break duration',
                duration: 5_000,
                options: {
                  // This has to be high enough to exceed the exponential backoff
                  circuitBreakDuration: 5_000,
                },
              },
            ])('using $desc', ({ duration, options }) => {
              it('returns what the service returns', async () => {
                const maxConsecutiveFailures = DEFAULT_MAX_RETRIES;
                let invocationCounter = 0;
                const error = new Error('failure');
                const mockService = (): { some: string } => {
                  invocationCounter += 1;
                  if (invocationCounter === DEFAULT_MAX_RETRIES + 1) {
                    return { some: 'data' };
                  }
                  throw error;
                };
                const policy = createServicePolicy({
                  maxConsecutiveFailures,
                  ...options,
                });

                const firstExecution = policy.execute(mockService);
                // It's safe not to await this promise; adding it to the promise
                // queue is enough to prevent this test from running indefinitely.
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                jest.runAllTimersAsync();
                await ignoreRejection(firstExecution);
                jest.advanceTimersByTime(duration);
                const result = await policy.execute(mockService);

                expect(result).toStrictEqual({ some: 'data' });
              });

              it('calls onAvailable listeners once, even if the service is called more than once', async () => {
                const maxConsecutiveFailures = DEFAULT_MAX_RETRIES;
                let invocationCounter = 0;
                const error = new Error('failure');
                const mockService = (): { some: string } => {
                  invocationCounter += 1;
                  if (invocationCounter >= DEFAULT_MAX_RETRIES + 1) {
                    return { some: 'data' };
                  }
                  throw error;
                };
                const onAvailableListener = jest.fn();
                const policy = createServicePolicy({
                  maxConsecutiveFailures,
                  ...options,
                });
                policy.onAvailable(onAvailableListener);

                const firstExecution = policy.execute(mockService);
                // It's safe not to await this promise; adding it to the promise
                // queue is enough to prevent this test from running indefinitely.
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                jest.runAllTimersAsync();
                await ignoreRejection(firstExecution);
                jest.advanceTimersByTime(duration);
                await policy.execute(mockService);
                await policy.execute(mockService);

                expect(onAvailableListener).toHaveBeenCalledTimes(1);
              });
            });
          });
        });
      });
    });

    describe('using a custom max number of retries', () => {
      it(`calls the service a total of 1 + <maxRetries> times, delaying each retry using a backoff formula`, async () => {
        const maxRetries = 5;
        let invocationCounter = 0;
        const error = new Error('failure');
        const mockService = jest.fn(() => {
          invocationCounter += 1;
          if (invocationCounter === maxRetries + 1) {
            return { some: 'data' };
          }
          throw error;
        });
        const policy = createServicePolicy({ maxRetries });
        // Each retry delay is randomized using a decorrelated jitter formula,
        // so we need to prevent that
        jest.spyOn(Math, 'random').mockReturnValue(0);

        const promise = policy.execute(mockService);
        // It's safe not to await these promises; adding them to the promise
        // queue is enough to prevent this test from running indefinitely.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        jest.advanceTimersByTimeAsync(0);
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        jest.advanceTimersByTimeAsync(176.27932892814937);
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        jest.advanceTimersByTimeAsync(186.8886145345685);
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        jest.advanceTimersByTimeAsync(366.8287823691078);
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        jest.advanceTimersByTimeAsync(731.8792783578953);
        await promise;

        expect(mockService).toHaveBeenCalledTimes(1 + maxRetries);
      });

      describe(`using the default max number of consecutive failures (${DEFAULT_MAX_CONSECUTIVE_FAILURES})`, () => {
        describe('if the initial run + retries is less than the max number of consecutive failures', () => {
          it('returns what the service returns', async () => {
            const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES - 2;
            let invocationCounter = 0;
            const error = new Error('failure');
            const mockService = (): { some: string } => {
              invocationCounter += 1;
              if (invocationCounter === maxRetries + 1) {
                return { some: 'data' };
              }
              throw error;
            };
            const policy = createServicePolicy({ maxRetries });

            const promise = policy.execute(mockService);
            // It's safe not to await this promise; adding it to the promise
            // queue is enough to prevent this test from running indefinitely.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            jest.runAllTimersAsync();

            expect(await promise).toStrictEqual({ some: 'data' });
          });

          it('does not call onBreak listeners', async () => {
            const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES - 2;
            let invocationCounter = 0;
            const error = new Error('failure');
            const mockService = (): { some: string } => {
              invocationCounter += 1;
              if (invocationCounter === maxRetries + 1) {
                return { some: 'data' };
              }
              throw error;
            };
            const onBreakListener = jest.fn();
            const policy = createServicePolicy({ maxRetries });

            policy.onBreak(onBreakListener);

            const promise = policy.execute(mockService);
            // It's safe not to await this promise; adding it to the promise
            // queue is enough to prevent this test from running indefinitely.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            jest.runAllTimersAsync();
            await promise;

            expect(onBreakListener).not.toHaveBeenCalled();
          });

          describe.each([
            {
              desc: `the default degraded threshold (${DEFAULT_DEGRADED_THRESHOLD})`,
              threshold: DEFAULT_DEGRADED_THRESHOLD,
              options: {},
            },
            {
              desc: 'a custom degraded threshold',
              threshold: 2000,
              options: { degradedThreshold: 2000 },
            },
          ])('using $desc', ({ threshold, options }) => {
            describe('if the service execution time is below the threshold', () => {
              it('does not call onDegraded listeners', async () => {
                const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES - 2;
                let invocationCounter = 0;
                const error = new Error('failure');
                const mockService = (): { some: string } => {
                  invocationCounter += 1;
                  if (invocationCounter === maxRetries + 1) {
                    return { some: 'data' };
                  }
                  throw error;
                };
                const onDegradedListener = jest.fn();
                const policy = createServicePolicy({ ...options, maxRetries });
                policy.onDegraded(onDegradedListener);

                const promise = policy.execute(mockService);
                // It's safe not to await this promise; adding it to the promise
                // queue is enough to prevent this test from running indefinitely.
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                jest.runAllTimersAsync();
                await promise;

                expect(onDegradedListener).not.toHaveBeenCalled();
              });

              it('calls onAvailable listeners once, even if the service is called more than once', async () => {
                const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES - 2;
                let invocationCounter = 0;
                const error = new Error('failure');
                const mockService = (): { some: string } => {
                  invocationCounter += 1;
                  if (invocationCounter >= maxRetries + 1) {
                    return { some: 'data' };
                  }
                  throw error;
                };
                const onAvailableListener = jest.fn();
                const policy = createServicePolicy({ ...options, maxRetries });
                policy.onAvailable(onAvailableListener);

                const promise = policy.execute(mockService);
                // It's safe not to await this promise; adding it to the promise
                // queue is enough to prevent this test from running indefinitely.
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                jest.runAllTimersAsync();
                await promise;
                await policy.execute(mockService);

                expect(onAvailableListener).toHaveBeenCalledTimes(1);
              });
            });

            describe('if the service execution time is beyond the threshold', () => {
              it('calls onDegraded listeners once', async () => {
                const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES - 2;
                const delay = threshold + 1;
                let invocationCounter = 0;
                const mockService = (): Promise<{ some: string }> => {
                  invocationCounter += 1;
                  return new Promise((resolve, reject) => {
                    if (invocationCounter === DEFAULT_MAX_RETRIES + 1) {
                      setTimeout(() => resolve({ some: 'data' }), delay);
                    } else {
                      reject(new Error('failure'));
                    }
                  });
                };
                const onDegradedListener = jest.fn();
                const policy = createServicePolicy({ ...options, maxRetries });
                policy.onDegraded(onDegradedListener);

                const promise = policy.execute(mockService);
                // It's safe not to await this promise; adding it to the promise
                // queue is enough to prevent this test from running indefinitely.
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                jest.runAllTimersAsync();
                await promise;

                expect(onDegradedListener).toHaveBeenCalledTimes(1);
              });

              it('does not call onAvailable listeners', async () => {
                const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES - 2;
                const delay = threshold + 1;
                let invocationCounter = 0;
                const mockService = (): Promise<{ some: string }> => {
                  invocationCounter += 1;
                  return new Promise((resolve, reject) => {
                    if (invocationCounter === DEFAULT_MAX_RETRIES + 1) {
                      setTimeout(() => resolve({ some: 'data' }), delay);
                    } else {
                      reject(new Error('failure'));
                    }
                  });
                };
                const onAvailableListener = jest.fn();
                const policy = createServicePolicy({ ...options, maxRetries });
                policy.onAvailable(onAvailableListener);

                const promise = policy.execute(mockService);
                // It's safe not to await this promise; adding it to the promise
                // queue is enough to prevent this test from running indefinitely.
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                jest.runAllTimersAsync();
                await promise;

                expect(onAvailableListener).not.toHaveBeenCalled();
              });
            });
          });
        });

        describe('if the initial run + retries is equal to the max number of consecutive failures', () => {
          it('returns what the service returns', async () => {
            const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES - 1;
            let invocationCounter = 0;
            const error = new Error('failure');
            const mockService = (): { some: string } => {
              invocationCounter += 1;
              if (invocationCounter === maxRetries + 1) {
                return { some: 'data' };
              }
              throw error;
            };
            const policy = createServicePolicy({ maxRetries });

            const promise = policy.execute(mockService);
            // It's safe not to await this promise; adding it to the promise
            // queue is enough to prevent this test from running indefinitely.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            jest.runAllTimersAsync();

            expect(await promise).toStrictEqual({ some: 'data' });
          });

          it('does not call onBreak listeners', async () => {
            const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES - 1;
            let invocationCounter = 0;
            const error = new Error('failure');
            const mockService = (): { some: string } => {
              invocationCounter += 1;
              if (invocationCounter === maxRetries + 1) {
                return { some: 'data' };
              }
              throw error;
            };
            const onBreakListener = jest.fn();
            const policy = createServicePolicy({ maxRetries });

            policy.onBreak(onBreakListener);

            const promise = policy.execute(mockService);
            // It's safe not to await this promise; adding it to the promise
            // queue is enough to prevent this test from running indefinitely.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            jest.runAllTimersAsync();
            await promise;

            expect(onBreakListener).not.toHaveBeenCalled();
          });

          describe.each([
            {
              desc: `the default degraded threshold (${DEFAULT_DEGRADED_THRESHOLD})`,
              threshold: DEFAULT_DEGRADED_THRESHOLD,
              options: {},
            },
            {
              desc: 'a custom degraded threshold',
              threshold: 2000,
              options: { degradedThreshold: 2000 },
            },
          ])('using $desc', () => {
            describe('if the service execution time is below the threshold', () => {
              it('does not call onDegraded listeners', async () => {
                const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES - 1;
                let invocationCounter = 0;
                const error = new Error('failure');
                const mockService = (): { some: string } => {
                  invocationCounter += 1;
                  if (invocationCounter === maxRetries + 1) {
                    return { some: 'data' };
                  }
                  throw error;
                };
                const onDegradedListener = jest.fn();
                const policy = createServicePolicy({ maxRetries });
                policy.onDegraded(onDegradedListener);

                const promise = policy.execute(mockService);
                // It's safe not to await this promise; adding it to the promise
                // queue is enough to prevent this test from running indefinitely.
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                jest.runAllTimersAsync();
                await promise;

                expect(onDegradedListener).not.toHaveBeenCalled();
              });

              it('calls onAvailable listeners once, even if the service is called more than once', async () => {
                const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES - 1;
                let invocationCounter = 0;
                const error = new Error('failure');
                const mockService = (): { some: string } => {
                  invocationCounter += 1;
                  if (invocationCounter >= maxRetries + 1) {
                    return { some: 'data' };
                  }
                  throw error;
                };
                const onAvailableListener = jest.fn();
                const policy = createServicePolicy({ maxRetries });
                policy.onAvailable(onAvailableListener);

                const promise = policy.execute(mockService);
                // It's safe not to await this promise; adding it to the promise
                // queue is enough to prevent this test from running indefinitely.
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                jest.runAllTimersAsync();
                await promise;
                await policy.execute(mockService);

                expect(onAvailableListener).toHaveBeenCalledTimes(1);
              });
            });

            describe('if the service execution time is beyond the threshold', () => {
              it('calls onDegraded listeners once', async () => {
                const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES - 1;
                const delay = DEFAULT_DEGRADED_THRESHOLD + 1;
                let invocationCounter = 0;
                const mockService = (): Promise<{ some: string }> => {
                  invocationCounter += 1;
                  return new Promise((resolve, reject) => {
                    if (invocationCounter === DEFAULT_MAX_RETRIES + 1) {
                      setTimeout(() => resolve({ some: 'data' }), delay);
                    } else {
                      reject(new Error('failure'));
                    }
                  });
                };
                const onDegradedListener = jest.fn();
                const policy = createServicePolicy({ maxRetries });
                policy.onDegraded(onDegradedListener);

                const promise = policy.execute(mockService);
                // It's safe not to await this promise; adding it to the promise
                // queue is enough to prevent this test from running indefinitely.
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                jest.runAllTimersAsync();
                await promise;

                expect(onDegradedListener).toHaveBeenCalledTimes(1);
              });

              it('does not call onAvailable listeners', async () => {
                const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES - 1;
                const delay = DEFAULT_DEGRADED_THRESHOLD + 1;
                let invocationCounter = 0;
                const mockService = (): Promise<{ some: string }> => {
                  invocationCounter += 1;
                  return new Promise((resolve, reject) => {
                    if (invocationCounter === DEFAULT_MAX_RETRIES + 1) {
                      setTimeout(() => resolve({ some: 'data' }), delay);
                    } else {
                      reject(new Error('failure'));
                    }
                  });
                };
                const onAvailableListener = jest.fn();
                const policy = createServicePolicy({ maxRetries });
                policy.onAvailable(onAvailableListener);

                const promise = policy.execute(mockService);
                // It's safe not to await this promise; adding it to the promise
                // queue is enough to prevent this test from running indefinitely.
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                jest.runAllTimersAsync();
                await promise;

                expect(onAvailableListener).not.toHaveBeenCalled();
              });
            });
          });
        });

        describe('if the initial run + retries is greater than the max number of consecutive failures', () => {
          it('throws a BrokenCircuitError before the service can succeed', async () => {
            const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES;
            let invocationCounter = 0;
            const error = new Error('failure');
            const mockService = (): { some: string } => {
              invocationCounter += 1;
              if (invocationCounter === maxRetries + 1) {
                return { some: 'data' };
              }
              throw error;
            };
            const policy = createServicePolicy({ maxRetries });

            const promise = policy.execute(mockService);
            // It's safe not to await this promise; adding it to the promise
            // queue is enough to prevent this test from running indefinitely.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            jest.runAllTimersAsync();

            await expect(promise).rejects.toThrow(
              new Error(
                'Execution prevented because the circuit breaker is open',
              ),
            );
          });

          it('calls onBreak listeners once with the error', async () => {
            const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES;
            let invocationCounter = 0;
            const error = new Error('failure');
            const mockService = (): { some: string } => {
              invocationCounter += 1;
              if (invocationCounter === maxRetries + 1) {
                return { some: 'data' };
              }
              throw error;
            };
            const onBreakListener = jest.fn();
            const policy = createServicePolicy({ maxRetries });

            policy.onBreak(onBreakListener);

            const promise = policy.execute(mockService);
            // It's safe not to await this promise; adding it to the promise
            // queue is enough to prevent this test from running indefinitely.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            jest.runAllTimersAsync();
            await ignoreRejection(promise);

            expect(onBreakListener).toHaveBeenCalledTimes(1);
            expect(onBreakListener).toHaveBeenCalledWith({ error });
          });

          it('does not call onDegraded listeners', async () => {
            const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES;
            let invocationCounter = 0;
            const error = new Error('failure');
            const mockService = (): { some: string } => {
              invocationCounter += 1;
              if (invocationCounter === maxRetries + 1) {
                return { some: 'data' };
              }
              throw error;
            };
            const onDegradedListener = jest.fn();
            const policy = createServicePolicy({ maxRetries });
            policy.onDegraded(onDegradedListener);

            const promise = policy.execute(mockService);
            // It's safe not to await this promise; adding it to the promise
            // queue is enough to prevent this test from running indefinitely.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            jest.runAllTimersAsync();
            await ignoreRejection(promise);

            expect(onDegradedListener).not.toHaveBeenCalled();
          });

          it('does not call onAvailable listeners', async () => {
            const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES;
            let invocationCounter = 0;
            const error = new Error('failure');
            const mockService = (): { some: string } => {
              invocationCounter += 1;
              if (invocationCounter === maxRetries + 1) {
                return { some: 'data' };
              }
              throw error;
            };
            const onAvailableListener = jest.fn();
            const policy = createServicePolicy({ maxRetries });
            policy.onAvailable(onAvailableListener);

            const promise = policy.execute(mockService);
            // It's safe not to await this promise; adding it to the promise
            // queue is enough to prevent this test from running indefinitely.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            jest.runAllTimersAsync();
            await ignoreRejection(promise);

            expect(onAvailableListener).not.toHaveBeenCalled();
          });

          describe('after the circuit break duration has elapsed', () => {
            describe.each([
              {
                desc: `the default circuit break duration (${DEFAULT_CIRCUIT_BREAK_DURATION})`,
                duration: DEFAULT_CIRCUIT_BREAK_DURATION,
                options: {},
              },
              {
                desc: 'a custom circuit break duration',
                duration: 5_000,
                options: {
                  // This has to be high enough to exceed the exponential backoff
                  circuitBreakDuration: 50_000,
                },
              },
            ])('using $desc', ({ duration, options }) => {
              it('returns what the service returns', async () => {
                const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES;
                let invocationCounter = 0;
                const error = new Error('failure');
                const mockService = (): { some: string } => {
                  invocationCounter += 1;
                  if (invocationCounter === maxRetries + 1) {
                    return { some: 'data' };
                  }
                  throw error;
                };
                const policy = createServicePolicy({ maxRetries, ...options });

                const firstExecution = policy.execute(mockService);
                // It's safe not to await this promise; adding it to the promise
                // queue is enough to prevent this test from running indefinitely.
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                jest.runAllTimersAsync();
                await ignoreRejection(firstExecution);
                jest.advanceTimersByTime(duration);
                const result = await policy.execute(mockService);

                expect(result).toStrictEqual({ some: 'data' });
              });

              it('calls onAvailable listeners once, even if the service is called more than once', async () => {
                const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES;
                let invocationCounter = 0;
                const error = new Error('failure');
                const mockService = (): { some: string } => {
                  invocationCounter += 1;
                  if (invocationCounter >= maxRetries + 1) {
                    return { some: 'data' };
                  }
                  throw error;
                };
                const onAvailableListener = jest.fn();
                const policy = createServicePolicy({ maxRetries, ...options });
                policy.onAvailable(onAvailableListener);

                const firstExecution = policy.execute(mockService);
                // It's safe not to await this promise; adding it to the promise
                // queue is enough to prevent this test from running indefinitely.
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                jest.runAllTimersAsync();
                await ignoreRejection(firstExecution);
                jest.advanceTimersByTime(duration);
                await policy.execute(mockService);
                await policy.execute(mockService);

                expect(onAvailableListener).toHaveBeenCalledTimes(1);
              });
            });
          });
        });
      });

      describe('using a custom max number of consecutive failures', () => {
        describe('if the initial run + retries is less than the max number of consecutive failures', () => {
          it('returns what the service returns', async () => {
            const maxConsecutiveFailures = 5;
            const maxRetries = maxConsecutiveFailures - 2;
            let invocationCounter = 0;
            const error = new Error('failure');
            const mockService = (): { some: string } => {
              invocationCounter += 1;
              if (invocationCounter === maxRetries + 1) {
                return { some: 'data' };
              }
              throw error;
            };
            const policy = createServicePolicy({
              maxRetries,
              maxConsecutiveFailures,
            });

            const promise = policy.execute(mockService);
            // It's safe not to await this promise; adding it to the promise
            // queue is enough to prevent this test from running indefinitely.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            jest.runAllTimersAsync();

            expect(await promise).toStrictEqual({ some: 'data' });
          });

          it('does not call onBreak listeners', async () => {
            const maxConsecutiveFailures = 5;
            const maxRetries = maxConsecutiveFailures - 2;
            let invocationCounter = 0;
            const error = new Error('failure');
            const mockService = (): { some: string } => {
              invocationCounter += 1;
              if (invocationCounter === maxRetries + 1) {
                return { some: 'data' };
              }
              throw error;
            };
            const onBreakListener = jest.fn();
            const policy = createServicePolicy({
              maxRetries,
              maxConsecutiveFailures,
            });

            policy.onBreak(onBreakListener);

            const promise = policy.execute(mockService);
            // It's safe not to await this promise; adding it to the promise
            // queue is enough to prevent this test from running indefinitely.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            jest.runAllTimersAsync();
            await promise;

            expect(onBreakListener).not.toHaveBeenCalled();
          });

          describe.each([
            {
              desc: `the default degraded threshold (${DEFAULT_DEGRADED_THRESHOLD})`,
              threshold: DEFAULT_DEGRADED_THRESHOLD,
              options: {},
            },
            {
              desc: 'a custom degraded threshold',
              threshold: 2000,
              options: { degradedThreshold: 2000 },
            },
          ])('using $desc', ({ threshold, options }) => {
            describe('if the service execution time is below the threshold', () => {
              it('does not call onDegraded listeners', async () => {
                const maxConsecutiveFailures = 5;
                const maxRetries = maxConsecutiveFailures - 2;
                let invocationCounter = 0;
                const error = new Error('failure');
                const mockService = (): { some: string } => {
                  invocationCounter += 1;
                  if (invocationCounter === maxRetries + 1) {
                    return { some: 'data' };
                  }
                  throw error;
                };
                const onDegradedListener = jest.fn();
                const policy = createServicePolicy({
                  maxRetries,
                  maxConsecutiveFailures,
                  ...options,
                });
                policy.onDegraded(onDegradedListener);

                const promise = policy.execute(mockService);
                // It's safe not to await this promise; adding it to the promise
                // queue is enough to prevent this test from running indefinitely.
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                jest.runAllTimersAsync();
                await promise;

                expect(onDegradedListener).not.toHaveBeenCalled();
              });

              it('calls onAvailable listeners once, even if the service is called more than once', async () => {
                const maxConsecutiveFailures = 5;
                const maxRetries = maxConsecutiveFailures - 2;
                let invocationCounter = 0;
                const error = new Error('failure');
                const mockService = (): { some: string } => {
                  invocationCounter += 1;
                  if (invocationCounter >= maxRetries + 1) {
                    return { some: 'data' };
                  }
                  throw error;
                };
                const onAvailableListener = jest.fn();
                const policy = createServicePolicy({
                  maxRetries,
                  maxConsecutiveFailures,
                  ...options,
                });
                policy.onAvailable(onAvailableListener);

                const promise1 = policy.execute(mockService);
                // It's safe not to await this promise; adding it to the promise
                // queue is enough to prevent this test from running indefinitely.
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                jest.runAllTimersAsync();
                await promise1;
                const promise2 = policy.execute(mockService);
                // It's safe not to await this promise; adding it to the promise
                // queue is enough to prevent this test from running indefinitely.
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                jest.runAllTimersAsync();
                await promise2;

                expect(onAvailableListener).toHaveBeenCalledTimes(1);
              });
            });

            describe('if the service execution time is beyond the threshold', () => {
              it('calls onDegraded listeners once', async () => {
                const maxConsecutiveFailures = 5;
                const maxRetries = maxConsecutiveFailures - 2;
                const delay = DEFAULT_DEGRADED_THRESHOLD + 1;
                let invocationCounter = 0;
                const mockService = (): Promise<{ some: string }> => {
                  invocationCounter += 1;
                  return new Promise((resolve, reject) => {
                    if (invocationCounter === DEFAULT_MAX_RETRIES + 1) {
                      setTimeout(() => resolve({ some: 'data' }), delay);
                    } else {
                      reject(new Error('failure'));
                    }
                  });
                };
                const onDegradedListener = jest.fn();
                const policy = createServicePolicy({
                  maxRetries,
                  maxConsecutiveFailures,
                  ...options,
                });
                policy.onDegraded(onDegradedListener);

                const promise = policy.execute(mockService);
                // It's safe not to await this promise; adding it to the promise
                // queue is enough to prevent this test from running indefinitely.
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                jest.runAllTimersAsync();
                await promise;

                expect(onDegradedListener).toHaveBeenCalledTimes(1);
              });

              it('does not call onAvailable listeners', async () => {
                const maxConsecutiveFailures = 5;
                const maxRetries = maxConsecutiveFailures - 2;
                const delay = threshold + 1;
                let invocationCounter = 0;
                const mockService = (): Promise<{ some: string }> => {
                  invocationCounter += 1;
                  return new Promise((resolve, reject) => {
                    if (invocationCounter === DEFAULT_MAX_RETRIES + 1) {
                      setTimeout(() => resolve({ some: 'data' }), delay);
                    } else {
                      reject(new Error('failure'));
                    }
                  });
                };
                const onAvailableListener = jest.fn();
                const policy = createServicePolicy({
                  maxRetries,
                  maxConsecutiveFailures,
                  ...options,
                });
                policy.onAvailable(onAvailableListener);

                const promise = policy.execute(mockService);
                // It's safe not to await this promise; adding it to the promise
                // queue is enough to prevent this test from running indefinitely.
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                jest.runAllTimersAsync();
                await promise;

                expect(onAvailableListener).not.toHaveBeenCalled();
              });
            });
          });
        });

        describe('if the initial run + retries is equal to the max number of consecutive failures', () => {
          it('returns what the service returns', async () => {
            const maxConsecutiveFailures = 5;
            const maxRetries = maxConsecutiveFailures - 1;
            let invocationCounter = 0;
            const error = new Error('failure');
            const mockService = (): { some: string } => {
              invocationCounter += 1;
              if (invocationCounter === maxRetries + 1) {
                return { some: 'data' };
              }
              throw error;
            };
            const policy = createServicePolicy({
              maxRetries,
              maxConsecutiveFailures,
            });

            const promise = policy.execute(mockService);
            // It's safe not to await this promise; adding it to the promise
            // queue is enough to prevent this test from running indefinitely.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            jest.runAllTimersAsync();

            expect(await promise).toStrictEqual({ some: 'data' });
          });

          it('does not call onBreak listeners', async () => {
            const maxConsecutiveFailures = 5;
            const maxRetries = maxConsecutiveFailures - 1;
            let invocationCounter = 0;
            const error = new Error('failure');
            const mockService = (): { some: string } => {
              invocationCounter += 1;
              if (invocationCounter === maxRetries + 1) {
                return { some: 'data' };
              }
              throw error;
            };
            const onBreakListener = jest.fn();
            const policy = createServicePolicy({
              maxRetries,
              maxConsecutiveFailures,
            });

            policy.onBreak(onBreakListener);

            const promise = policy.execute(mockService);
            // It's safe not to await this promise; adding it to the promise
            // queue is enough to prevent this test from running indefinitely.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            jest.runAllTimersAsync();
            await promise;

            expect(onBreakListener).not.toHaveBeenCalled();
          });

          describe.each([
            {
              desc: `the default degraded threshold (${DEFAULT_DEGRADED_THRESHOLD})`,
              threshold: DEFAULT_DEGRADED_THRESHOLD,
              options: {},
            },
            {
              desc: 'a custom degraded threshold',
              threshold: 2000,
              options: { degradedThreshold: 2000 },
            },
          ])('using $desc', ({ threshold, options }) => {
            describe('if the service execution time is below the threshold', () => {
              it('does not call onDegraded listeners', async () => {
                const maxConsecutiveFailures = 5;
                const maxRetries = maxConsecutiveFailures - 1;
                let invocationCounter = 0;
                const error = new Error('failure');
                const mockService = (): { some: string } => {
                  invocationCounter += 1;
                  if (invocationCounter === maxRetries + 1) {
                    return { some: 'data' };
                  }
                  throw error;
                };
                const onDegradedListener = jest.fn();
                const policy = createServicePolicy({
                  maxRetries,
                  maxConsecutiveFailures,
                  ...options,
                });
                policy.onDegraded(onDegradedListener);

                const promise = policy.execute(mockService);
                // It's safe not to await this promise; adding it to the promise
                // queue is enough to prevent this test from running indefinitely.
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                jest.runAllTimersAsync();
                await promise;

                expect(onDegradedListener).not.toHaveBeenCalled();
              });

              it('calls onAvailable listeners once, even if the service is called more than once', async () => {
                const maxConsecutiveFailures = 5;
                const maxRetries = maxConsecutiveFailures - 1;
                let invocationCounter = 0;
                const error = new Error('failure');
                const mockService = (): { some: string } => {
                  invocationCounter += 1;
                  if (invocationCounter % (maxRetries + 1) === 0) {
                    return { some: 'data' };
                  }
                  throw error;
                };
                const onAvailableListener = jest.fn();
                const policy = createServicePolicy({
                  maxRetries,
                  maxConsecutiveFailures,
                  ...options,
                });
                policy.onAvailable(onAvailableListener);

                const promise1 = policy.execute(mockService);
                // It's safe not to await this promise; adding it to the promise
                // queue is enough to prevent this test from running indefinitely.
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                jest.runAllTimersAsync();
                await promise1;
                const promise2 = policy.execute(mockService);
                // It's safe not to await this promise; adding it to the promise
                // queue is enough to prevent this test from running indefinitely.
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                jest.runAllTimersAsync();
                await promise2;

                expect(onAvailableListener).toHaveBeenCalledTimes(1);
              });
            });

            describe('if the service execution time is beyond the threshold', () => {
              it('calls onDegraded listeners once', async () => {
                const maxConsecutiveFailures = 5;
                const maxRetries = maxConsecutiveFailures - 1;
                const delay = threshold + 1;
                let invocationCounter = 0;
                const mockService = (): Promise<{ some: string }> => {
                  invocationCounter += 1;
                  return new Promise((resolve, reject) => {
                    if (invocationCounter === DEFAULT_MAX_RETRIES + 1) {
                      setTimeout(() => resolve({ some: 'data' }), delay);
                    } else {
                      reject(new Error('failure'));
                    }
                  });
                };
                const onDegradedListener = jest.fn();
                const policy = createServicePolicy({
                  maxRetries,
                  maxConsecutiveFailures,
                  ...options,
                });
                policy.onDegraded(onDegradedListener);

                const promise = policy.execute(mockService);
                // It's safe not to await this promise; adding it to the promise
                // queue is enough to prevent this test from running indefinitely.
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                jest.runAllTimersAsync();
                await promise;

                expect(onDegradedListener).toHaveBeenCalledTimes(1);
              });

              it('does not call onAvailable listeners', async () => {
                const maxConsecutiveFailures = 5;
                const maxRetries = maxConsecutiveFailures - 1;
                const delay = threshold + 1;
                let invocationCounter = 0;
                const mockService = (): Promise<{ some: string }> => {
                  invocationCounter += 1;
                  return new Promise((resolve, reject) => {
                    if (invocationCounter === DEFAULT_MAX_RETRIES + 1) {
                      setTimeout(() => resolve({ some: 'data' }), delay);
                    } else {
                      reject(new Error('failure'));
                    }
                  });
                };
                const onAvailableListener = jest.fn();
                const policy = createServicePolicy({
                  maxRetries,
                  maxConsecutiveFailures,
                  ...options,
                });
                policy.onAvailable(onAvailableListener);

                const promise = policy.execute(mockService);
                // It's safe not to await this promise; adding it to the promise
                // queue is enough to prevent this test from running indefinitely.
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                jest.runAllTimersAsync();
                await promise;

                expect(onAvailableListener).not.toHaveBeenCalled();
              });
            });
          });
        });

        describe('if the initial run + retries is greater than the max number of consecutive failures', () => {
          it('throws a BrokenCircuitError before the service can succeed', async () => {
            const maxConsecutiveFailures = 5;
            const maxRetries = maxConsecutiveFailures;
            let invocationCounter = 0;
            const error = new Error('failure');
            const mockService = (): { some: string } => {
              invocationCounter += 1;
              if (invocationCounter === maxRetries + 1) {
                return { some: 'data' };
              }
              throw error;
            };
            const policy = createServicePolicy({
              maxRetries,
              maxConsecutiveFailures,
            });

            const promise = policy.execute(mockService);
            // It's safe not to await this promise; adding it to the promise
            // queue is enough to prevent this test from running indefinitely.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            jest.runAllTimersAsync();
            await ignoreRejection(promise);

            await expect(promise).rejects.toThrow(
              new Error(
                'Execution prevented because the circuit breaker is open',
              ),
            );
          });

          it('calls onBreak listeners once with the error', async () => {
            const maxConsecutiveFailures = 5;
            const maxRetries = maxConsecutiveFailures;
            let invocationCounter = 0;
            const error = new Error('failure');
            const mockService = (): { some: string } => {
              invocationCounter += 1;
              if (invocationCounter === maxRetries + 1) {
                return { some: 'data' };
              }
              throw error;
            };
            const onBreakListener = jest.fn();
            const policy = createServicePolicy({
              maxRetries,
              maxConsecutiveFailures,
            });

            policy.onBreak(onBreakListener);

            const promise = policy.execute(mockService);
            // It's safe not to await this promise; adding it to the promise
            // queue is enough to prevent this test from running indefinitely.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            jest.runAllTimersAsync();
            await ignoreRejection(promise);

            expect(onBreakListener).toHaveBeenCalledTimes(1);
            expect(onBreakListener).toHaveBeenCalledWith({ error });
          });

          it('does not call onDegraded listeners', async () => {
            const maxConsecutiveFailures = 5;
            const maxRetries = maxConsecutiveFailures;
            let invocationCounter = 0;
            const error = new Error('failure');
            const mockService = (): { some: string } => {
              invocationCounter += 1;
              if (invocationCounter === maxRetries + 1) {
                return { some: 'data' };
              }
              throw error;
            };
            const onDegradedListener = jest.fn();
            const policy = createServicePolicy({
              maxRetries,
              maxConsecutiveFailures,
            });
            policy.onDegraded(onDegradedListener);

            const promise = policy.execute(mockService);
            // It's safe not to await this promise; adding it to the promise
            // queue is enough to prevent this test from running indefinitely.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            jest.runAllTimersAsync();
            await ignoreRejection(promise);

            expect(onDegradedListener).not.toHaveBeenCalled();
          });

          it('does not call onAvailable listeners', async () => {
            const maxConsecutiveFailures = 5;
            const maxRetries = maxConsecutiveFailures;
            let invocationCounter = 0;
            const error = new Error('failure');
            const mockService = (): { some: string } => {
              invocationCounter += 1;
              if (invocationCounter === maxRetries + 1) {
                return { some: 'data' };
              }
              throw error;
            };
            const onAvailableListener = jest.fn();
            const policy = createServicePolicy({
              maxRetries,
              maxConsecutiveFailures,
            });
            policy.onAvailable(onAvailableListener);

            const promise = policy.execute(mockService);
            // It's safe not to await this promise; adding it to the promise
            // queue is enough to prevent this test from running indefinitely.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            jest.runAllTimersAsync();
            await ignoreRejection(promise);

            expect(onAvailableListener).not.toHaveBeenCalled();
          });

          describe('after the circuit break duration has elapsed', () => {
            describe.each([
              {
                desc: `the default circuit break duration (${DEFAULT_CIRCUIT_BREAK_DURATION})`,
                duration: DEFAULT_CIRCUIT_BREAK_DURATION,
                options: {},
              },
              {
                desc: 'a custom circuit break duration',
                duration: 5_000,
                options: {
                  // This has to be high enough to exceed the exponential backoff
                  circuitBreakDuration: 5_000,
                },
              },
            ])('using $desc', ({ duration, options }) => {
              it('returns what the service returns', async () => {
                const maxConsecutiveFailures = 5;
                const maxRetries = maxConsecutiveFailures;
                let invocationCounter = 0;
                const error = new Error('failure');
                const mockService = (): { some: string } => {
                  invocationCounter += 1;
                  if (invocationCounter === maxRetries + 1) {
                    return { some: 'data' };
                  }
                  throw error;
                };
                const policy = createServicePolicy({
                  maxRetries,
                  maxConsecutiveFailures,
                  ...options,
                });

                const firstExecution = policy.execute(mockService);
                // It's safe not to await this promise; adding it to the promise
                // queue is enough to prevent this test from running indefinitely.
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                jest.runAllTimersAsync();
                await ignoreRejection(firstExecution);
                jest.advanceTimersByTime(duration);
                const result = await policy.execute(mockService);

                expect(result).toStrictEqual({ some: 'data' });
              });

              it('calls onAvailable listeners once, even if the service is called more than once', async () => {
                const maxConsecutiveFailures = 5;
                const maxRetries = maxConsecutiveFailures;
                let invocationCounter = 0;
                const error = new Error('failure');
                const mockService = (): { some: string } => {
                  invocationCounter += 1;
                  if (invocationCounter >= maxRetries + 1) {
                    return { some: 'data' };
                  }
                  throw error;
                };
                const onAvailableListener = jest.fn();
                const policy = createServicePolicy({
                  maxRetries,
                  maxConsecutiveFailures,
                  ...options,
                });
                policy.onAvailable(onAvailableListener);

                const firstExecution = policy.execute(mockService);
                // It's safe not to await this promise; adding it to the promise
                // queue is enough to prevent this test from running indefinitely.
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                jest.runAllTimersAsync();
                await ignoreRejection(firstExecution);
                jest.advanceTimersByTime(duration);
                await policy.execute(mockService);
                await policy.execute(mockService);

                expect(onAvailableListener).toHaveBeenCalledTimes(1);
              });
            });
          });
        });
      });
    });
  });

  describe('wrapping a service that succeeds at first and then fails enough to break the circuit', () => {
    describe.each([
      {
        desc: `the default max number of consecutive failures (${DEFAULT_MAX_CONSECUTIVE_FAILURES})`,
        maxConsecutiveFailures: DEFAULT_MAX_CONSECUTIVE_FAILURES,
        optionsWithMaxConsecutiveFailures: {},
      },
      {
        desc: 'a custom max number of consecutive failures',
        maxConsecutiveFailures: DEFAULT_MAX_RETRIES + 1,
        optionsWithMaxConsecutiveFailures: {
          maxConsecutiveFailures: DEFAULT_MAX_RETRIES + 1,
        },
      },
    ])(
      'using $desc',
      ({ maxConsecutiveFailures, optionsWithMaxConsecutiveFailures }) => {
        describe.each([
          {
            desc: `the default circuit break duration (${DEFAULT_CIRCUIT_BREAK_DURATION})`,
            circuitBreakDuration: DEFAULT_CIRCUIT_BREAK_DURATION,
            optionsWithCircuitBreakDuration: {},
          },
          {
            desc: 'a custom circuit break duration',
            circuitBreakDuration: DEFAULT_CIRCUIT_BREAK_DURATION,
            optionsWithCircuitBreakDuration: {
              // This has to be high enough to exceed the exponential backoff
              circuitBreakDuration: 5_000,
            },
          },
        ])(
          'using $desc',
          ({ circuitBreakDuration, optionsWithCircuitBreakDuration }) => {
            it('calls onAvailable listeners if the service finally succeeds', async () => {
              let invocationCounter = 0;
              const mockService = jest.fn(() => {
                invocationCounter += 1;
                if (
                  invocationCounter === 1 ||
                  invocationCounter === maxConsecutiveFailures + 2
                ) {
                  return { some: 'data' };
                }
                throw new Error('failure');
              });
              const onAvailableListener = jest.fn();
              const policy = createServicePolicy({
                ...optionsWithMaxConsecutiveFailures,
                ...optionsWithCircuitBreakDuration,
              });
              policy.onRetry(() => {
                jest.advanceTimersToNextTimer();
              });
              policy.onAvailable(onAvailableListener);

              // Execute the service successfully once
              await policy.execute(mockService);
              expect(onAvailableListener).toHaveBeenCalledTimes(1);

              // Execute and retry until we break the circuit
              await ignoreRejection(policy.execute(mockService));
              await ignoreRejection(policy.execute(mockService));
              await ignoreRejection(policy.execute(mockService));
              jest.advanceTimersByTime(circuitBreakDuration);

              await policy.execute(mockService);
              expect(onAvailableListener).toHaveBeenCalledTimes(2);
            });

            it('does not call onAvailable listeners if the service finally fails', async () => {
              let invocationCounter = 0;
              const mockService = jest.fn(() => {
                invocationCounter += 1;
                if (invocationCounter === 1) {
                  return { some: 'data' };
                }
                throw new Error('failure');
              });
              const onAvailableListener = jest.fn();
              const policy = createServicePolicy({
                ...optionsWithMaxConsecutiveFailures,
                ...optionsWithCircuitBreakDuration,
              });
              policy.onRetry(() => {
                jest.advanceTimersToNextTimer();
              });
              policy.onAvailable(onAvailableListener);

              // Execute the service successfully once
              await policy.execute(mockService);
              expect(onAvailableListener).toHaveBeenCalledTimes(1);

              // Execute and retry until we break the circuit
              await ignoreRejection(policy.execute(mockService));
              await ignoreRejection(policy.execute(mockService));
              await ignoreRejection(policy.execute(mockService));
              jest.advanceTimersByTime(circuitBreakDuration);

              await ignoreRejection(policy.execute(mockService));
              expect(onAvailableListener).toHaveBeenCalledTimes(1);
            });
          },
        );
      },
    );
  });

  describe('getRemainingCircuitOpenDuration', () => {
    it('returns the number of milliseconds before the circuit will transition from open to half-open', async () => {
      const mockService = (): never => {
        throw new Error('failure');
      };
      const policy = createServicePolicy();
      policy.onRetry(() => {
        jest.advanceTimersToNextTimer();
      });
      // Retry until we break the circuit
      await ignoreRejection(policy.execute(mockService));
      await ignoreRejection(policy.execute(mockService));
      await ignoreRejection(policy.execute(mockService));
      jest.advanceTimersByTime(1000);

      expect(policy.getRemainingCircuitOpenDuration()).toBe(
        DEFAULT_CIRCUIT_BREAK_DURATION - 1000,
      );
    });

    it('returns null if the circuit is closed', () => {
      const policy = createServicePolicy();

      expect(policy.getRemainingCircuitOpenDuration()).toBeNull();
    });
  });

  describe('getCircuitState', () => {
    it('returns the state of the circuit', async () => {
      const mockService = (): never => {
        throw new Error('failure');
      };
      const policy = createServicePolicy();
      policy.onRetry(() => {
        jest.advanceTimersToNextTimer();
      });

      expect(policy.getCircuitState()).toBe(CircuitState.Closed);

      // Retry until we break the circuit
      await ignoreRejection(policy.execute(mockService));
      await ignoreRejection(policy.execute(mockService));
      await ignoreRejection(policy.execute(mockService));
      expect(policy.getCircuitState()).toBe(CircuitState.Open);

      jest.advanceTimersByTime(DEFAULT_CIRCUIT_BREAK_DURATION);
      const promise = ignoreRejection(policy.execute(mockService));
      expect(policy.getCircuitState()).toBe(CircuitState.HalfOpen);
      await promise;
      expect(policy.getCircuitState()).toBe(CircuitState.Open);
    });
  });

  describe('reset', () => {
    it('resets the state of the circuit to "closed"', async () => {
      let invocationCounter = 0;
      const mockService = jest.fn(() => {
        invocationCounter += 1;
        if (invocationCounter === DEFAULT_MAX_CONSECUTIVE_FAILURES + 1) {
          return { some: 'data' };
        }
        throw new Error('failure');
      });
      const policy = createServicePolicy();
      policy.onRetry(() => {
        jest.advanceTimersToNextTimer();
      });
      // Retry until we break the circuit
      await ignoreRejection(policy.execute(mockService));
      await ignoreRejection(policy.execute(mockService));
      await ignoreRejection(policy.execute(mockService));
      expect(policy.getCircuitState()).toBe(CircuitState.Open);

      policy.reset();

      expect(policy.getCircuitState()).toBe(CircuitState.Closed);
    });

    it('allows the service to be executed successfully again if its circuit has broken after resetting', async () => {
      let invocationCounter = 0;
      const mockService = jest.fn(() => {
        invocationCounter += 1;
        if (invocationCounter === DEFAULT_MAX_CONSECUTIVE_FAILURES + 1) {
          return { some: 'data' };
        }
        throw new Error('failure');
      });
      const policy = createServicePolicy();
      policy.onRetry(() => {
        jest.advanceTimersToNextTimer();
      });
      // Retry until we break the circuit
      await ignoreRejection(policy.execute(mockService));
      await ignoreRejection(policy.execute(mockService));
      await ignoreRejection(policy.execute(mockService));

      policy.reset();

      expect(await policy.execute(mockService)).toStrictEqual({ some: 'data' });
    });

    it('calls onAvailable listeners if the service was executed successfully, its circuit broke, it was reset, and executes again, successfully', async () => {
      let invocationCounter = 0;
      const mockService = jest.fn(() => {
        invocationCounter += 1;
        if (
          invocationCounter === 1 ||
          invocationCounter === DEFAULT_MAX_CONSECUTIVE_FAILURES + 2
        ) {
          return { some: 'data' };
        }
        throw new Error('failure');
      });
      const onAvailableListener = jest.fn();
      const policy = createServicePolicy();
      policy.onRetry(() => {
        jest.advanceTimersToNextTimer();
      });
      policy.onAvailable(onAvailableListener);

      // Execute the service successfully once
      await policy.execute(mockService);
      expect(onAvailableListener).toHaveBeenCalledTimes(1);

      // Execute and retry until we break the circuit
      await ignoreRejection(policy.execute(mockService));
      await ignoreRejection(policy.execute(mockService));
      await ignoreRejection(policy.execute(mockService));

      policy.reset();

      await policy.execute(mockService);
      expect(onAvailableListener).toHaveBeenCalledTimes(2);
    });

    it('allows the service to be executed unsuccessfully again if its circuit has broken after resetting', async () => {
      const mockService = jest.fn(() => {
        throw new Error('failure');
      });
      const policy = createServicePolicy();
      policy.onRetry(() => {
        jest.advanceTimersToNextTimer();
      });
      // Retry until we break the circuit
      await ignoreRejection(policy.execute(mockService));
      await ignoreRejection(policy.execute(mockService));
      await ignoreRejection(policy.execute(mockService));

      policy.reset();

      await expect(policy.execute(mockService)).rejects.toThrow('failure');
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
