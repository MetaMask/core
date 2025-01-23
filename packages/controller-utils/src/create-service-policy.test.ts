// We use conditions exclusively in this file.
/* eslint-disable jest/no-conditional-in-test */

import { handleWhen } from 'cockatiel';
import { useFakeTimers } from 'sinon';
import type { SinonFakeTimers } from 'sinon';

import {
  createServicePolicy,
  DEFAULT_CIRCUIT_BREAK_DURATION,
  DEFAULT_DEGRADED_THRESHOLD,
  DEFAULT_MAX_CONSECUTIVE_FAILURES,
  DEFAULT_MAX_RETRIES,
} from './create-service-policy';

describe('createServicePolicy', () => {
  let clock: SinonFakeTimers;

  beforeEach(() => {
    clock = useFakeTimers();
  });

  afterEach(() => {
    clock.restore();
  });

  describe('wrapping a service that succeeds on the first try', () => {
    it('returns a policy that returns what the service returns', async () => {
      const mockService = jest.fn(() => ({ some: 'data' }));
      const policy = createServicePolicy();

      const returnValue = await policy.execute(mockService);

      expect(returnValue).toStrictEqual({ some: 'data' });
    });

    it('only calls the service once before returning', async () => {
      const mockService = jest.fn(() => ({ some: 'data' }));
      const policy = createServicePolicy();

      await policy.execute(mockService);

      expect(mockService).toHaveBeenCalledTimes(1);
    });

    it('does not call the listener passed to onBreak, since the circuit never opens', async () => {
      const mockService = jest.fn(() => ({ some: 'data' }));
      const onBreakListener = jest.fn();
      const policy = createServicePolicy();
      policy.onBreak(onBreakListener);

      await policy.execute(mockService);

      expect(onBreakListener).not.toHaveBeenCalled();
    });

    describe(`using the default degraded threshold (${DEFAULT_DEGRADED_THRESHOLD})`, () => {
      it('does not call the listener passed to onDegraded if the service execution time is below the threshold', async () => {
        const mockService = jest.fn(() => ({ some: 'data' }));
        const onDegradedListener = jest.fn();
        const policy = createServicePolicy();
        policy.onDegraded(onDegradedListener);

        await policy.execute(mockService);

        expect(onDegradedListener).not.toHaveBeenCalled();
      });

      it('calls the listener passed to onDegraded once if the service execution time is beyond the threshold', async () => {
        const delay = DEFAULT_DEGRADED_THRESHOLD + 1;
        const mockService = jest.fn(() => {
          return new Promise((resolve) => {
            setTimeout(() => resolve({ some: 'data' }), delay);
          });
        });
        const onDegradedListener = jest.fn();
        const policy = createServicePolicy();
        policy.onDegraded(onDegradedListener);

        const promise = policy.execute(mockService);
        clock.tick(delay);
        await promise;

        expect(onDegradedListener).toHaveBeenCalledTimes(1);
      });
    });

    describe('using a custom degraded threshold', () => {
      it('does not call the listener passed to onDegraded if the service execution time below the threshold', async () => {
        const degradedThreshold = 2000;
        const mockService = jest.fn(() => ({ some: 'data' }));
        const onDegradedListener = jest.fn();
        const policy = createServicePolicy({ degradedThreshold });
        policy.onDegraded(onDegradedListener);

        await policy.execute(mockService);

        expect(onDegradedListener).not.toHaveBeenCalled();
      });

      it('calls the listener passed to onDegraded once if the service execution time beyond the threshold', async () => {
        const degradedThreshold = 2000;
        const delay = degradedThreshold + 1;
        const mockService = jest.fn(() => {
          return new Promise((resolve) => {
            setTimeout(() => resolve({ some: 'data' }), delay);
          });
        });
        const onDegradedListener = jest.fn();
        const policy = createServicePolicy({ degradedThreshold });
        policy.onDegraded(onDegradedListener);

        const promise = policy.execute(mockService);
        clock.tick(delay);
        await promise;

        expect(onDegradedListener).toHaveBeenCalledTimes(1);
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

      it('does not call the listener passed to onRetry', async () => {
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

      it('does not call the listener passed to onBreak', async () => {
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
        clock.runAllAsync();
        await ignoreRejection(promise);

        expect(onBreakListener).not.toHaveBeenCalled();
      });

      it('does not call the listener passed to onDegraded', async () => {
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
        clock.runAllAsync();
        await ignoreRejection(promise);

        expect(onDegradedListener).not.toHaveBeenCalled();
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
          clock.tickAsync(0);
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          clock.tickAsync(176.27932892814937);
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          clock.tickAsync(186.8886145345685);
          await ignoreRejection(promise);

          expect(mockService).toHaveBeenCalledTimes(1 + DEFAULT_MAX_RETRIES);
        });

        it('calls the listener passed to onRetry once per retry', async () => {
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
          clock.runAllAsync();
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
            clock.runAllAsync();

            await expect(promise).rejects.toThrow(error);
          });

          it('does not call the listener passed to onBreak, since the max number of consecutive failures is never reached', async () => {
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
            clock.runAllAsync();
            await ignoreRejection(promise);

            expect(onBreakListener).not.toHaveBeenCalled();
          });

          it('calls the listener passed to onDegraded once, since the circuit is still closed', async () => {
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
            clock.runAllAsync();
            await ignoreRejection(promise);

            expect(onDegradedListener).toHaveBeenCalledTimes(1);
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
              clock.runAllAsync();

              await expect(promise).rejects.toThrow(error);
            });

            it('does not call the listener passed to onBreak', async () => {
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
              clock.runAllAsync();
              await ignoreRejection(promise);

              expect(onBreakListener).not.toHaveBeenCalled();
            });

            it('calls the listener passed to onDegraded once', async () => {
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
              clock.runAllAsync();
              await ignoreRejection(promise);

              expect(onDegradedListener).toHaveBeenCalledTimes(1);
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
              clock.runAllAsync();

              await expect(promise).rejects.toThrow(error);
            });

            it('calls the listener passed to onBreak once with the error', async () => {
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
              clock.runAllAsync();
              await ignoreRejection(promise);

              expect(onBreakListener).toHaveBeenCalledTimes(1);
              expect(onBreakListener).toHaveBeenCalledWith({ error });
            });

            it('never calls the listener passed to onDegraded, since the circuit is open', async () => {
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
              clock.runAllAsync();
              await ignoreRejection(promise);

              expect(onDegradedListener).not.toHaveBeenCalled();
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
              clock.runAllAsync();
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
              clock.runAllAsync();

              await expect(promise).rejects.toThrow(
                new Error(
                  'Execution prevented because the circuit breaker is open',
                ),
              );
            });

            it('calls the listener passed to onBreak once with the error', async () => {
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
              clock.runAllAsync();
              await ignoreRejection(promise);

              expect(onBreakListener).toHaveBeenCalledTimes(1);
              expect(onBreakListener).toHaveBeenCalledWith({ error });
            });

            it('never calls the listener passed to onDegraded, since the circuit is open', async () => {
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
              clock.runAllAsync();
              await ignoreRejection(promise);

              expect(onDegradedListener).not.toHaveBeenCalled();
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
          clock.tickAsync(0);
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          clock.tickAsync(176.27932892814937);
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          clock.tickAsync(186.8886145345685);
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          clock.tickAsync(366.8287823691078);
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          clock.tickAsync(731.8792783578953);
          await ignoreRejection(promise);

          expect(mockService).toHaveBeenCalledTimes(1 + maxRetries);
        });

        it('calls the onRetry callback once per retry', async () => {
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
          clock.runAllAsync();
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
              clock.runAllAsync();

              await expect(promise).rejects.toThrow(error);
            });

            it('does not call the onBreak callback', async () => {
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
              clock.runAllAsync();
              await ignoreRejection(promise);

              expect(onBreakListener).not.toHaveBeenCalled();
            });

            it('calls the onDegraded callback once', async () => {
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
              clock.runAllAsync();
              await ignoreRejection(promise);

              expect(onDegradedListener).toHaveBeenCalledTimes(1);
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
              clock.runAllAsync();

              await expect(promise).rejects.toThrow(error);
            });

            it('calls the onBreak callback once with the error', async () => {
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
              clock.runAllAsync();
              await ignoreRejection(promise);

              expect(onBreakListener).toHaveBeenCalledTimes(1);
              expect(onBreakListener).toHaveBeenCalledWith({ error });
            });

            it('never calls the onDegraded callback, since the circuit is open', async () => {
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
              clock.runAllAsync();
              await ignoreRejection(promise);

              expect(onDegradedListener).not.toHaveBeenCalled();
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
              clock.runAllAsync();
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
              clock.runAllAsync();

              await expect(promise).rejects.toThrow(
                new Error(
                  'Execution prevented because the circuit breaker is open',
                ),
              );
            });

            it('calls the onBreak callback once with the error', async () => {
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
              clock.runAllAsync();
              await ignoreRejection(promise);

              expect(onBreakListener).toHaveBeenCalledTimes(1);
              expect(onBreakListener).toHaveBeenCalledWith({ error });
            });

            it('never calls the onDegraded callback, since the circuit is open', async () => {
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
              clock.runAllAsync();
              await ignoreRejection(promise);

              expect(onDegradedListener).not.toHaveBeenCalled();
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
              clock.runAllAsync();

              await expect(promise).rejects.toThrow(error);
            });

            it('does not call the onBreak callback', async () => {
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
              clock.runAllAsync();
              await ignoreRejection(promise);

              expect(onBreakListener).not.toHaveBeenCalled();
            });

            it('calls the onDegraded callback once', async () => {
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
              clock.runAllAsync();
              await ignoreRejection(promise);

              expect(onDegradedListener).toHaveBeenCalledTimes(1);
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
              clock.runAllAsync();

              await expect(promise).rejects.toThrow(error);
            });

            it('calls the onBreak callback once with the error', async () => {
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
              clock.runAllAsync();
              await ignoreRejection(promise);

              expect(onBreakListener).toHaveBeenCalledTimes(1);
              expect(onBreakListener).toHaveBeenCalledWith({ error });
            });

            it('never calls the onDegraded callback, since the circuit is open', async () => {
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
              clock.runAllAsync();
              await ignoreRejection(promise);

              expect(onDegradedListener).not.toHaveBeenCalled();
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
              clock.runAllAsync();
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
              clock.runAllAsync();

              await expect(promise).rejects.toThrow(
                new Error(
                  'Execution prevented because the circuit breaker is open',
                ),
              );
            });

            it('calls the onBreak callback once with the error', async () => {
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
              clock.runAllAsync();
              await ignoreRejection(promise);

              expect(onBreakListener).toHaveBeenCalledTimes(1);
              expect(onBreakListener).toHaveBeenCalledWith({ error });
            });

            it('never calls the onDegraded callback, since the circuit is open', async () => {
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
              clock.runAllAsync();
              await ignoreRejection(promise);

              expect(onDegradedListener).not.toHaveBeenCalled();
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
        clock.tickAsync(0);
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        clock.tickAsync(176.27932892814937);
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        clock.tickAsync(186.8886145345685);
        await promise;

        expect(mockService).toHaveBeenCalledTimes(1 + DEFAULT_MAX_RETRIES);
      });

      describe(`using the default max number of consecutive failures (${DEFAULT_MAX_CONSECUTIVE_FAILURES})`, () => {
        it('returns what the service returns', async () => {
          let invocationCounter = 0;
          const mockService = () => {
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
          clock.runAllAsync();

          expect(await promise).toStrictEqual({ some: 'data' });
        });

        it('does not call the onBreak callback, since the max number of consecutive failures is never reached', async () => {
          let invocationCounter = 0;
          const mockService = () => {
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
          clock.runAllAsync();
          await promise;

          expect(onBreakListener).not.toHaveBeenCalled();
        });

        describe(`using the default degraded threshold (${DEFAULT_DEGRADED_THRESHOLD})`, () => {
          it('does not call the onDegraded callback if the service execution time is below the threshold', async () => {
            let invocationCounter = 0;
            const mockService = () => {
              invocationCounter += 1;
              if (invocationCounter === DEFAULT_MAX_RETRIES + 1) {
                return { some: 'data' };
              }
              throw new Error('failure');
            };
            const onDegradedListener = jest.fn();
            const policy = createServicePolicy();
            policy.onDegraded(onDegradedListener);

            const promise = policy.execute(mockService);
            // It's safe not to await this promise; adding it to the promise
            // queue is enough to prevent this test from running indefinitely.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            clock.runAllAsync();
            await promise;

            expect(onDegradedListener).not.toHaveBeenCalled();
          });

          it('calls the onDegraded callback once if the service execution time is beyond the threshold', async () => {
            let invocationCounter = 0;
            const delay = DEFAULT_DEGRADED_THRESHOLD + 1;
            const mockService = () => {
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
            const policy = createServicePolicy();
            policy.onDegraded(onDegradedListener);

            const promise = policy.execute(mockService);
            // It's safe not to await this promise; adding it to the promise
            // queue is enough to prevent this test from running indefinitely.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            clock.runAllAsync();
            await promise;

            expect(onDegradedListener).toHaveBeenCalledTimes(1);
          });
        });

        describe('using a custom degraded threshold', () => {
          it('does not call the onDegraded callback if the service execution time is below the threshold', async () => {
            const degradedThreshold = 2000;
            let invocationCounter = 0;
            const mockService = () => {
              invocationCounter += 1;
              if (invocationCounter === DEFAULT_MAX_RETRIES + 1) {
                return { some: 'data' };
              }
              throw new Error('failure');
            };
            const onDegradedListener = jest.fn();
            const policy = createServicePolicy({
              degradedThreshold,
            });
            policy.onDegraded(onDegradedListener);

            const promise = policy.execute(mockService);
            // It's safe not to await this promise; adding it to the promise
            // queue is enough to prevent this test from running indefinitely.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            clock.runAllAsync();
            await promise;

            expect(onDegradedListener).not.toHaveBeenCalled();
          });

          it('calls the onDegraded callback once if the service execution time is beyond the threshold', async () => {
            const degradedThreshold = 2000;
            let invocationCounter = 0;
            const delay = degradedThreshold + 1;
            const mockService = () => {
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
              degradedThreshold,
            });
            policy.onDegraded(onDegradedListener);

            const promise = policy.execute(mockService);
            // It's safe not to await this promise; adding it to the promise
            // queue is enough to prevent this test from running indefinitely.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            clock.runAllAsync();
            await promise;

            expect(onDegradedListener).toHaveBeenCalledTimes(1);
          });
        });
      });

      describe('using a custom max number of consecutive failures', () => {
        describe('if the initial run + retries is less than the max number of consecutive failures', () => {
          it('returns what the service returns', async () => {
            const maxConsecutiveFailures = DEFAULT_MAX_RETRIES + 2;
            let invocationCounter = 0;
            const mockService = () => {
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
            clock.runAllAsync();

            expect(await promise).toStrictEqual({ some: 'data' });
          });

          it('does not call the onBreak callback', async () => {
            const maxConsecutiveFailures = DEFAULT_MAX_RETRIES + 2;
            let invocationCounter = 0;
            const mockService = () => {
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
            clock.runAllAsync();
            await promise;

            expect(onBreakListener).not.toHaveBeenCalled();
          });

          describe(`using the default degraded threshold (${DEFAULT_DEGRADED_THRESHOLD})`, () => {
            it('does not call the onDegraded callback if the service execution time is below the threshold', async () => {
              const maxConsecutiveFailures = DEFAULT_MAX_RETRIES + 2;
              let invocationCounter = 0;
              const mockService = () => {
                invocationCounter += 1;
                if (invocationCounter === DEFAULT_MAX_RETRIES + 1) {
                  return { some: 'data' };
                }
                throw new Error('failure');
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
              clock.runAllAsync();
              await promise;

              expect(onDegradedListener).not.toHaveBeenCalled();
            });

            it('calls the onDegraded callback once if the service execution time is beyond the threshold', async () => {
              const maxConsecutiveFailures = DEFAULT_MAX_RETRIES + 2;
              const delay = DEFAULT_DEGRADED_THRESHOLD + 1;
              let invocationCounter = 0;
              const mockService = () => {
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
              });
              policy.onDegraded(onDegradedListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              clock.runAllAsync();
              await promise;

              expect(onDegradedListener).toHaveBeenCalledTimes(1);
            });
          });

          describe('using a custom degraded threshold', () => {
            it('does not call the onDegraded callback if the service execution time is below the threshold', async () => {
              const degradedThreshold = 2000;
              const maxConsecutiveFailures = DEFAULT_MAX_RETRIES + 2;
              let invocationCounter = 0;
              const mockService = () => {
                invocationCounter += 1;
                if (invocationCounter === DEFAULT_MAX_RETRIES + 1) {
                  return { some: 'data' };
                }
                throw new Error('failure');
              };
              const onDegradedListener = jest.fn();
              const policy = createServicePolicy({
                maxConsecutiveFailures,
                degradedThreshold,
              });
              policy.onDegraded(onDegradedListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              clock.runAllAsync();
              await promise;

              expect(onDegradedListener).not.toHaveBeenCalled();
            });

            it('calls the onDegraded callback once if the service execution time is beyond the threshold', async () => {
              const degradedThreshold = 2000;
              const maxConsecutiveFailures = DEFAULT_MAX_RETRIES + 2;
              const delay = degradedThreshold + 1;
              let invocationCounter = 0;
              const mockService = () => {
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
                degradedThreshold,
              });
              policy.onDegraded(onDegradedListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              clock.runAllAsync();
              await promise;

              expect(onDegradedListener).toHaveBeenCalledTimes(1);
            });
          });
        });

        describe('if the initial run + retries is equal to the max number of consecutive failures', () => {
          it('returns what the service returns', async () => {
            const maxConsecutiveFailures = DEFAULT_MAX_RETRIES + 1;
            let invocationCounter = 0;
            const mockService = () => {
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
            clock.runAllAsync();

            expect(await promise).toStrictEqual({ some: 'data' });
          });

          it('does not call the onBreak callback', async () => {
            const maxConsecutiveFailures = DEFAULT_MAX_RETRIES + 1;
            let invocationCounter = 0;
            const error = new Error('failure');
            const mockService = () => {
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
            clock.runAllAsync();
            await promise;

            expect(onBreakListener).not.toHaveBeenCalled();
          });

          describe(`using the default degraded threshold (${DEFAULT_DEGRADED_THRESHOLD})`, () => {
            it('does not call the onDegraded callback if the service execution time is below the threshold', async () => {
              const maxConsecutiveFailures = DEFAULT_MAX_RETRIES + 1;
              let invocationCounter = 0;
              const error = new Error('failure');
              const mockService = () => {
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
              clock.runAllAsync();
              await promise;

              expect(onDegradedListener).not.toHaveBeenCalled();
            });

            it('calls the onDegraded callback once if the service execution time is beyond the threshold', async () => {
              const maxConsecutiveFailures = DEFAULT_MAX_RETRIES + 1;
              const delay = DEFAULT_DEGRADED_THRESHOLD + 1;
              let invocationCounter = 0;
              const mockService = () => {
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
              });
              policy.onDegraded(onDegradedListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              clock.runAllAsync();
              await promise;

              expect(onDegradedListener).toHaveBeenCalledTimes(1);
            });
          });

          describe('using a custom degraded threshold', () => {
            it('does not call the onDegraded callback if the service execution time is below the threshold', async () => {
              const degradedThreshold = 2000;
              const maxConsecutiveFailures = DEFAULT_MAX_RETRIES + 1;
              let invocationCounter = 0;
              const error = new Error('failure');
              const mockService = () => {
                invocationCounter += 1;
                if (invocationCounter === DEFAULT_MAX_RETRIES + 1) {
                  return { some: 'data' };
                }
                throw error;
              };
              const onDegradedListener = jest.fn();
              const policy = createServicePolicy({
                maxConsecutiveFailures,
                degradedThreshold,
              });
              policy.onDegraded(onDegradedListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              clock.runAllAsync();
              await promise;

              expect(onDegradedListener).not.toHaveBeenCalled();
            });

            it('calls the onDegraded callback once if the service execution time is beyond the threshold', async () => {
              const degradedThreshold = 2000;
              const maxConsecutiveFailures = DEFAULT_MAX_RETRIES + 1;
              const delay = degradedThreshold + 1;
              let invocationCounter = 0;
              const mockService = () => {
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
                degradedThreshold,
              });
              policy.onDegraded(onDegradedListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              clock.runAllAsync();
              await promise;

              expect(onDegradedListener).toHaveBeenCalledTimes(1);
            });
          });
        });

        describe('if the initial run + retries is greater than the max number of consecutive failures', () => {
          it('throws a BrokenCircuitError before the service can succeed', async () => {
            const maxConsecutiveFailures = DEFAULT_MAX_RETRIES;
            let invocationCounter = 0;
            const error = new Error('failure');
            const mockService = () => {
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
            clock.runAllAsync();
            await expect(promise).rejects.toThrow(
              new Error(
                'Execution prevented because the circuit breaker is open',
              ),
            );
          });

          it('calls the onBreak callback once with the error', async () => {
            const maxConsecutiveFailures = DEFAULT_MAX_RETRIES;
            let invocationCounter = 0;
            const error = new Error('failure');
            const mockService = () => {
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
            clock.runAllAsync();
            await ignoreRejection(promise);

            expect(onBreakListener).toHaveBeenCalledTimes(1);
            expect(onBreakListener).toHaveBeenCalledWith({ error });
          });

          it('does not call the onDegraded callback', async () => {
            const maxConsecutiveFailures = DEFAULT_MAX_RETRIES;
            let invocationCounter = 0;
            const error = new Error('failure');
            const mockService = () => {
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
            clock.runAllAsync();
            await ignoreRejection(promise);

            expect(onDegradedListener).not.toHaveBeenCalled();
          });

          describe(`using the default circuit break duration (${DEFAULT_CIRCUIT_BREAK_DURATION})`, () => {
            it('returns what the service returns if it is successfully called again after the circuit break duration has elapsed', async () => {
              const maxConsecutiveFailures = DEFAULT_MAX_RETRIES;
              let invocationCounter = 0;
              const error = new Error('failure');
              const mockService = () => {
                invocationCounter += 1;
                if (invocationCounter === DEFAULT_MAX_RETRIES + 1) {
                  return { some: 'data' };
                }
                throw error;
              };
              const policy = createServicePolicy({
                maxConsecutiveFailures,
              });

              const firstExecution = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              clock.runAllAsync();
              await ignoreRejection(firstExecution);
              clock.tick(DEFAULT_CIRCUIT_BREAK_DURATION);
              const result = await policy.execute(mockService);

              expect(result).toStrictEqual({ some: 'data' });
            });
          });

          describe('using a custom circuit break duration', () => {
            it('returns what the service returns if it is successfully called again after the circuit break duration has elapsed', async () => {
              // This has to be high enough to exceed the exponential backoff
              const circuitBreakDuration = 5_000;
              const maxConsecutiveFailures = DEFAULT_MAX_RETRIES;
              let invocationCounter = 0;
              const error = new Error('failure');
              const mockService = () => {
                invocationCounter += 1;
                if (invocationCounter === DEFAULT_MAX_RETRIES + 1) {
                  return { some: 'data' };
                }
                throw error;
              };
              const policy = createServicePolicy({
                maxConsecutiveFailures,
                circuitBreakDuration,
              });

              const firstExecution = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              clock.runAllAsync();
              await ignoreRejection(firstExecution);
              clock.tick(circuitBreakDuration);
              const result = await policy.execute(mockService);

              expect(result).toStrictEqual({ some: 'data' });
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
        clock.tickAsync(0);
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        clock.tickAsync(176.27932892814937);
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        clock.tickAsync(186.8886145345685);
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        clock.tickAsync(366.8287823691078);
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        clock.tickAsync(731.8792783578953);
        await promise;

        expect(mockService).toHaveBeenCalledTimes(1 + maxRetries);
      });

      describe(`using the default max number of consecutive failures (${DEFAULT_MAX_CONSECUTIVE_FAILURES})`, () => {
        describe('if the initial run + retries is less than the max number of consecutive failures', () => {
          it('returns what the service returns', async () => {
            const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES - 2;
            let invocationCounter = 0;
            const error = new Error('failure');
            const mockService = () => {
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
            clock.runAllAsync();

            expect(await promise).toStrictEqual({ some: 'data' });
          });

          it('does not call the onBreak callback', async () => {
            const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES - 2;
            let invocationCounter = 0;
            const error = new Error('failure');
            const mockService = () => {
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
            clock.runAllAsync();
            await promise;

            expect(onBreakListener).not.toHaveBeenCalled();
          });

          describe(`using the default degraded threshold (${DEFAULT_DEGRADED_THRESHOLD})`, () => {
            it('does not call the onDegraded callback if the service execution time is below the threshold', async () => {
              const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES - 2;
              let invocationCounter = 0;
              const error = new Error('failure');
              const mockService = () => {
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
              clock.runAllAsync();
              await promise;

              expect(onDegradedListener).not.toHaveBeenCalled();
            });

            it('calls the onDegraded callback once if the service execution time is beyond the threshold', async () => {
              const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES - 2;
              const delay = DEFAULT_DEGRADED_THRESHOLD + 1;
              let invocationCounter = 0;
              const mockService = () => {
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
              clock.runAllAsync();
              await promise;

              expect(onDegradedListener).toHaveBeenCalledTimes(1);
            });
          });

          describe('using a custom degraded threshold', () => {
            it('does not call the onDegraded callback if the service execution time is below the threshold', async () => {
              const degradedThreshold = 2000;
              const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES - 2;
              let invocationCounter = 0;
              const error = new Error('failure');
              const mockService = () => {
                invocationCounter += 1;
                if (invocationCounter === maxRetries + 1) {
                  return { some: 'data' };
                }
                throw error;
              };
              const onDegradedListener = jest.fn();
              const policy = createServicePolicy({
                maxRetries,
                degradedThreshold,
              });
              policy.onDegraded(onDegradedListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              clock.runAllAsync();
              await promise;

              expect(onDegradedListener).not.toHaveBeenCalled();
            });

            it('calls the onDegraded callback once if the service execution time is beyond the threshold', async () => {
              const degradedThreshold = 2000;
              const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES - 2;
              const delay = degradedThreshold + 1;
              let invocationCounter = 0;
              const mockService = () => {
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
                degradedThreshold,
              });
              policy.onDegraded(onDegradedListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              clock.runAllAsync();
              await promise;

              expect(onDegradedListener).toHaveBeenCalledTimes(1);
            });
          });
        });

        describe('if the initial run + retries is equal to the max number of consecutive failures', () => {
          it('returns what the service returns', async () => {
            const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES - 1;
            let invocationCounter = 0;
            const error = new Error('failure');
            const mockService = () => {
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
            clock.runAllAsync();

            expect(await promise).toStrictEqual({ some: 'data' });
          });

          it('does not call the onBreak callback', async () => {
            const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES - 1;
            let invocationCounter = 0;
            const error = new Error('failure');
            const mockService = () => {
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
            clock.runAllAsync();
            await promise;

            expect(onBreakListener).not.toHaveBeenCalled();
          });

          describe(`using the default degraded threshold (${DEFAULT_DEGRADED_THRESHOLD})`, () => {
            it('does not call the onDegraded callback if the service execution time is below the threshold', async () => {
              const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES - 1;
              let invocationCounter = 0;
              const error = new Error('failure');
              const mockService = () => {
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
              clock.runAllAsync();
              await promise;

              expect(onDegradedListener).not.toHaveBeenCalled();
            });

            it('calls the onDegraded callback once if the service execution time is beyond the threshold', async () => {
              const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES - 1;
              const delay = DEFAULT_DEGRADED_THRESHOLD + 1;
              let invocationCounter = 0;
              const mockService = () => {
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
              clock.runAllAsync();
              await promise;

              expect(onDegradedListener).toHaveBeenCalledTimes(1);
            });
          });

          describe('using a custom degraded threshold', () => {
            it('does not call the onDegraded callback if the service execution time is below the threshold', async () => {
              const degradedThreshold = 2000;
              const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES - 1;
              let invocationCounter = 0;
              const error = new Error('failure');
              const mockService = () => {
                invocationCounter += 1;
                if (invocationCounter === maxRetries + 1) {
                  return { some: 'data' };
                }
                throw error;
              };
              const onDegradedListener = jest.fn();
              const policy = createServicePolicy({
                maxRetries,
                degradedThreshold,
              });
              policy.onDegraded(onDegradedListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              clock.runAllAsync();
              await promise;

              expect(onDegradedListener).not.toHaveBeenCalled();
            });

            it('calls the onDegraded callback once if the service execution time is beyond the threshold', async () => {
              const degradedThreshold = 2000;
              const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES - 1;
              const delay = degradedThreshold + 1;
              let invocationCounter = 0;
              const mockService = () => {
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
                degradedThreshold,
              });
              policy.onDegraded(onDegradedListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              clock.runAllAsync();
              await promise;

              expect(onDegradedListener).toHaveBeenCalledTimes(1);
            });
          });
        });

        describe('if the initial run + retries is greater than the max number of consecutive failures', () => {
          it('throws a BrokenCircuitError before the service can succeed', async () => {
            const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES;
            let invocationCounter = 0;
            const error = new Error('failure');
            const mockService = () => {
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
            clock.runAllAsync();

            await expect(promise).rejects.toThrow(
              new Error(
                'Execution prevented because the circuit breaker is open',
              ),
            );
          });

          it('calls the onBreak callback once with the error', async () => {
            const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES;
            let invocationCounter = 0;
            const error = new Error('failure');
            const mockService = () => {
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
            clock.runAllAsync();
            await ignoreRejection(promise);

            expect(onBreakListener).toHaveBeenCalledTimes(1);
            expect(onBreakListener).toHaveBeenCalledWith({ error });
          });

          it('does not call the onDegraded callback', async () => {
            const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES;
            let invocationCounter = 0;
            const error = new Error('failure');
            const mockService = () => {
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
            clock.runAllAsync();
            await ignoreRejection(promise);

            expect(onDegradedListener).not.toHaveBeenCalled();
          });

          describe(`using the default circuit break duration (${DEFAULT_CIRCUIT_BREAK_DURATION})`, () => {
            it('returns what the service returns if it is successfully called again after the circuit break duration has elapsed', async () => {
              const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES;
              let invocationCounter = 0;
              const error = new Error('failure');
              const mockService = () => {
                invocationCounter += 1;
                if (invocationCounter === maxRetries + 1) {
                  return { some: 'data' };
                }
                throw error;
              };
              const policy = createServicePolicy({ maxRetries });

              const firstExecution = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              clock.runAllAsync();
              await ignoreRejection(firstExecution);
              clock.tick(DEFAULT_CIRCUIT_BREAK_DURATION);
              const result = await policy.execute(mockService);

              expect(result).toStrictEqual({ some: 'data' });
            });
          });

          describe('using a custom circuit break duration', () => {
            it('returns what the service returns if it is successfully called again after the circuit break duration has elapsed', async () => {
              // This has to be high enough to exceed the exponential backoff
              const circuitBreakDuration = 50_000;
              const maxRetries = DEFAULT_MAX_CONSECUTIVE_FAILURES;
              let invocationCounter = 0;
              const error = new Error('failure');
              const mockService = () => {
                invocationCounter += 1;
                if (invocationCounter === maxRetries + 1) {
                  return { some: 'data' };
                }
                throw error;
              };
              const policy = createServicePolicy({
                maxRetries,
                circuitBreakDuration,
              });

              const firstExecution = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              clock.runAllAsync();
              await expect(firstExecution).rejects.toThrow(
                new Error(
                  'Execution prevented because the circuit breaker is open',
                ),
              );
              clock.tick(circuitBreakDuration);
              const result = await policy.execute(mockService);

              expect(result).toStrictEqual({ some: 'data' });
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
            const mockService = () => {
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
            clock.runAllAsync();

            expect(await promise).toStrictEqual({ some: 'data' });
          });

          it('does not call the onBreak callback', async () => {
            const maxConsecutiveFailures = 5;
            const maxRetries = maxConsecutiveFailures - 2;
            let invocationCounter = 0;
            const error = new Error('failure');
            const mockService = () => {
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
            clock.runAllAsync();
            await promise;

            expect(onBreakListener).not.toHaveBeenCalled();
          });

          describe(`using the default degraded threshold (${DEFAULT_DEGRADED_THRESHOLD})`, () => {
            it('does not call the onDegraded callback if the service execution time is below the threshold', async () => {
              const maxConsecutiveFailures = 5;
              const maxRetries = maxConsecutiveFailures - 2;
              let invocationCounter = 0;
              const error = new Error('failure');
              const mockService = () => {
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
              clock.runAllAsync();
              await promise;

              expect(onDegradedListener).not.toHaveBeenCalled();
            });

            it('calls the onDegraded callback once if the service execution time is beyond the threshold', async () => {
              const maxConsecutiveFailures = 5;
              const maxRetries = maxConsecutiveFailures - 2;
              const delay = DEFAULT_DEGRADED_THRESHOLD + 1;
              let invocationCounter = 0;
              const mockService = () => {
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
              });
              policy.onDegraded(onDegradedListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              clock.runAllAsync();
              await promise;

              expect(onDegradedListener).toHaveBeenCalledTimes(1);
            });
          });

          describe('using a custom degraded threshold', () => {
            it('does not call the onDegraded callback if the service execution time is below the threshold', async () => {
              const degradedThreshold = 2000;
              const maxConsecutiveFailures = 5;
              const maxRetries = maxConsecutiveFailures - 2;
              let invocationCounter = 0;
              const error = new Error('failure');
              const mockService = () => {
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
                degradedThreshold,
              });
              policy.onDegraded(onDegradedListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              clock.runAllAsync();
              await promise;

              expect(onDegradedListener).not.toHaveBeenCalled();
            });

            it('calls the onDegraded callback once if the service execution time is beyond the threshold', async () => {
              const degradedThreshold = 2000;
              const maxConsecutiveFailures = 5;
              const maxRetries = maxConsecutiveFailures - 2;
              const delay = degradedThreshold + 1;
              let invocationCounter = 0;
              const mockService = () => {
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
                degradedThreshold,
              });
              policy.onDegraded(onDegradedListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              clock.runAllAsync();
              await promise;

              expect(onDegradedListener).toHaveBeenCalledTimes(1);
            });
          });
        });

        describe('if the initial run + retries is equal to the max number of consecutive failures', () => {
          it('returns what the service returns', async () => {
            const maxConsecutiveFailures = 5;
            const maxRetries = maxConsecutiveFailures - 1;
            let invocationCounter = 0;
            const error = new Error('failure');
            const mockService = () => {
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
            clock.runAllAsync();

            expect(await promise).toStrictEqual({ some: 'data' });
          });

          it('does not call the onBreak callback', async () => {
            const maxConsecutiveFailures = 5;
            const maxRetries = maxConsecutiveFailures - 1;
            let invocationCounter = 0;
            const error = new Error('failure');
            const mockService = () => {
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
            clock.runAllAsync();
            await promise;

            expect(onBreakListener).not.toHaveBeenCalled();
          });

          describe(`using the default degraded threshold (${DEFAULT_DEGRADED_THRESHOLD})`, () => {
            it('does not call the onDegraded callback if the service execution time is below the threshold', async () => {
              const maxConsecutiveFailures = 5;
              const maxRetries = maxConsecutiveFailures - 1;
              let invocationCounter = 0;
              const error = new Error('failure');
              const mockService = () => {
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
              clock.runAllAsync();
              await promise;

              expect(onDegradedListener).not.toHaveBeenCalled();
            });

            it('calls the onDegraded callback once if the service execution time is beyond the threshold', async () => {
              const maxConsecutiveFailures = 5;
              const maxRetries = maxConsecutiveFailures - 1;
              const delay = DEFAULT_DEGRADED_THRESHOLD + 1;
              let invocationCounter = 0;
              const mockService = () => {
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
              });
              policy.onDegraded(onDegradedListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              clock.runAllAsync();
              await promise;

              expect(onDegradedListener).toHaveBeenCalledTimes(1);
            });
          });

          describe('using a custom degraded threshold', () => {
            it('does not call the onDegraded callback if the service execution time is below the threshold', async () => {
              const degradedThreshold = 2000;
              const maxConsecutiveFailures = 5;
              const maxRetries = maxConsecutiveFailures - 1;
              let invocationCounter = 0;
              const error = new Error('failure');
              const mockService = () => {
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
                degradedThreshold,
              });
              policy.onDegraded(onDegradedListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              clock.runAllAsync();
              await promise;

              expect(onDegradedListener).not.toHaveBeenCalled();
            });

            it('calls the onDegraded callback once if the service execution time is beyond the threshold', async () => {
              const degradedThreshold = 2000;
              const maxConsecutiveFailures = 5;
              const maxRetries = maxConsecutiveFailures - 1;
              const delay = degradedThreshold + 1;
              let invocationCounter = 0;
              const mockService = () => {
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
                degradedThreshold,
              });
              policy.onDegraded(onDegradedListener);

              const promise = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              clock.runAllAsync();
              await promise;

              expect(onDegradedListener).toHaveBeenCalledTimes(1);
            });
          });
        });

        describe('if the initial run + retries is greater than the max number of consecutive failures', () => {
          it('throws a BrokenCircuitError before the service can succeed', async () => {
            const maxConsecutiveFailures = 5;
            const maxRetries = maxConsecutiveFailures;
            let invocationCounter = 0;
            const error = new Error('failure');
            const mockService = () => {
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
            clock.runAllAsync();
            await ignoreRejection(promise);

            await expect(promise).rejects.toThrow(
              new Error(
                'Execution prevented because the circuit breaker is open',
              ),
            );
          });

          it('calls the onBreak callback once with the error', async () => {
            const maxConsecutiveFailures = 5;
            const maxRetries = maxConsecutiveFailures;
            let invocationCounter = 0;
            const error = new Error('failure');
            const mockService = () => {
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
            clock.runAllAsync();
            await ignoreRejection(promise);

            expect(onBreakListener).toHaveBeenCalledTimes(1);
            expect(onBreakListener).toHaveBeenCalledWith({ error });
          });

          it('does not call the onDegraded callback', async () => {
            const maxConsecutiveFailures = 5;
            const maxRetries = maxConsecutiveFailures;
            let invocationCounter = 0;
            const error = new Error('failure');
            const mockService = () => {
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
            clock.runAllAsync();
            await ignoreRejection(promise);

            expect(onDegradedListener).not.toHaveBeenCalled();
          });

          describe(`using the default circuit break duration (${DEFAULT_CIRCUIT_BREAK_DURATION})`, () => {
            it('returns what the service returns if it is successfully called again after the circuit break duration has elapsed', async () => {
              const maxConsecutiveFailures = 5;
              const maxRetries = maxConsecutiveFailures;
              let invocationCounter = 0;
              const error = new Error('failure');
              const mockService = () => {
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

              const firstExecution = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              clock.runAllAsync();
              await ignoreRejection(firstExecution);
              clock.tick(DEFAULT_CIRCUIT_BREAK_DURATION);
              const result = await policy.execute(mockService);

              expect(result).toStrictEqual({ some: 'data' });
            });
          });

          describe('using a custom circuit break duration', () => {
            it('returns what the service returns if it is successfully called again after the circuit break duration has elapsed', async () => {
              // This has to be high enough to exceed the exponential backoff
              const circuitBreakDuration = 5_000;
              const maxConsecutiveFailures = 5;
              const maxRetries = maxConsecutiveFailures;
              let invocationCounter = 0;
              const error = new Error('failure');
              const mockService = () => {
                invocationCounter += 1;
                if (invocationCounter === maxRetries + 1) {
                  return { some: 'data' };
                }
                throw error;
              };
              const policy = createServicePolicy({
                maxRetries,
                maxConsecutiveFailures,
                circuitBreakDuration,
              });

              const firstExecution = policy.execute(mockService);
              // It's safe not to await this promise; adding it to the promise
              // queue is enough to prevent this test from running indefinitely.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              clock.runAllAsync();
              await expect(firstExecution).rejects.toThrow(
                new Error(
                  'Execution prevented because the circuit breaker is open',
                ),
              );
              clock.tick(circuitBreakDuration);
              const result = await policy.execute(mockService);

              expect(result).toStrictEqual({ some: 'data' });
            });
          });
        });
      });
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
async function ignoreRejection<T>(promise: Promise<T>) {
  await expect(promise).rejects.toThrow(expect.any(Error));
}
