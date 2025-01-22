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

    it('does not call the onBreak callback, since the circuit never opens', async () => {
      const mockService = jest.fn(() => ({ some: 'data' }));
      const onBreak = jest.fn();
      const policy = createServicePolicy({ onBreak });

      await policy.execute(mockService);

      expect(onBreak).not.toHaveBeenCalled();
    });

    describe(`using the default degraded threshold (${DEFAULT_DEGRADED_THRESHOLD})`, () => {
      it('does not call the onDegraded callback if the service execution time is below the threshold', async () => {
        const mockService = jest.fn(() => ({ some: 'data' }));
        const onDegraded = jest.fn();
        const policy = createServicePolicy({ onDegraded });

        await policy.execute(mockService);

        expect(onDegraded).not.toHaveBeenCalled();
      });

      it('calls the onDegraded callback once if the service execution time is beyond the threshold', async () => {
        const delay = DEFAULT_DEGRADED_THRESHOLD + 1;
        const mockService = jest.fn(() => {
          return new Promise((resolve) => {
            setTimeout(() => resolve({ some: 'data' }), delay);
          });
        });
        const onDegraded = jest.fn();
        const policy = createServicePolicy({ onDegraded });

        const promise = policy.execute(mockService);
        clock.tick(delay);
        await promise;

        expect(onDegraded).toHaveBeenCalledTimes(1);
      });
    });

    describe('using a custom degraded threshold', () => {
      it('does not call the onDegraded callback if the service execution time below the threshold', async () => {
        const degradedThreshold = 2000;
        const mockService = jest.fn(() => ({ some: 'data' }));
        const onDegraded = jest.fn();
        const policy = createServicePolicy({ degradedThreshold, onDegraded });

        await policy.execute(mockService);

        expect(onDegraded).not.toHaveBeenCalled();
      });

      it('calls the onDegraded callback once if the service execution time beyond the threshold', async () => {
        const degradedThreshold = 2000;
        const delay = degradedThreshold + 1;
        const mockService = jest.fn(() => {
          return new Promise((resolve) => {
            setTimeout(() => resolve({ some: 'data' }), delay);
          });
        });
        const onDegraded = jest.fn();
        const policy = createServicePolicy({ degradedThreshold, onDegraded });

        const promise = policy.execute(mockService);
        clock.tick(delay);
        await promise;

        expect(onDegraded).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('wrapping a service that always fails', () => {
    it(`calls the service a total of ${
      1 + DEFAULT_MAX_RETRIES
    } times, delaying each retry using a backoff formula`, async () => {
      const error = new Error('failure');
      const mockService = jest.fn(() => {
        throw error;
      });
      const policy = createServicePolicy();

      const promise = policy.execute(mockService);
      // It's safe not to await this promise; adding it to the promise queue is
      // enough to prevent this test from running indefinitely.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      clock.runAllAsync();
      await ignoreRejection(promise);

      expect(mockService).toHaveBeenCalledTimes(1 + DEFAULT_MAX_RETRIES);
    });

    it('calls the onRetry callback once per retry', async () => {
      const error = new Error('failure');
      const mockService = jest.fn(() => {
        throw error;
      });
      const onRetry = jest.fn();
      const policy = createServicePolicy({ onRetry });

      const promise = policy.execute(mockService);
      // It's safe not to await this promise; adding it to the promise queue is
      // enough to prevent this test from running indefinitely.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      clock.runAllAsync();
      await ignoreRejection(promise);

      expect(onRetry).toHaveBeenCalledTimes(DEFAULT_MAX_RETRIES);
    });

    describe(`using the default max number of consecutive failures (${DEFAULT_MAX_CONSECUTIVE_FAILURES})`, () => {
      it('throws what the service throws', async () => {
        const error = new Error('failure');
        const mockService = jest.fn(() => {
          throw error;
        });
        const policy = createServicePolicy();

        const promise = policy.execute(mockService);
        // It's safe not to await this promise; adding it to the promise queue
        // is enough to prevent this test from running indefinitely.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        clock.runAllAsync();

        await expect(promise).rejects.toThrow(error);
      });

      it('does not call the onBreak callback, since the max number of consecutive failures is never reached', async () => {
        const error = new Error('failure');
        const mockService = jest.fn(() => {
          throw error;
        });
        const onBreak = jest.fn();
        const policy = createServicePolicy({ onBreak });

        const promise = policy.execute(mockService);
        // It's safe not to await this promise; adding it to the promise queue
        // is enough to prevent this test from running indefinitely.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        clock.runAllAsync();
        await ignoreRejection(promise);

        expect(onBreak).not.toHaveBeenCalled();
      });

      it('calls the onDegraded callback once, since the circuit is still closed', async () => {
        const error = new Error('failure');
        const mockService = jest.fn(() => {
          throw error;
        });
        const onDegraded = jest.fn();
        const policy = createServicePolicy({ onDegraded });

        const promise = policy.execute(mockService);
        // It's safe not to await this promise; adding it to the promise queue
        // is enough to prevent this test from running indefinitely.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        clock.runAllAsync();
        await ignoreRejection(promise);

        expect(onDegraded).toHaveBeenCalledTimes(1);
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
          const onBreak = jest.fn();
          const policy = createServicePolicy({
            maxConsecutiveFailures,
            onBreak,
          });

          const promise = policy.execute(mockService);
          // It's safe not to await this promise; adding it to the promise queue
          // is enough to prevent this test from running indefinitely.
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          clock.runAllAsync();

          await expect(promise).rejects.toThrow(error);
        });

        it('does not call the onBreak callback', async () => {
          const maxConsecutiveFailures = DEFAULT_MAX_RETRIES + 2;
          const error = new Error('failure');
          const mockService = jest.fn(() => {
            throw error;
          });
          const onBreak = jest.fn();
          const policy = createServicePolicy({
            maxConsecutiveFailures,
            onBreak,
          });

          const promise = policy.execute(mockService);
          // It's safe not to await this promise; adding it to the promise queue
          // is enough to prevent this test from running indefinitely.
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          clock.runAllAsync();
          await ignoreRejection(promise);

          expect(onBreak).not.toHaveBeenCalled();
        });

        it('calls the onDegraded callback once', async () => {
          const maxConsecutiveFailures = DEFAULT_MAX_RETRIES + 2;
          const error = new Error('failure');
          const mockService = jest.fn(() => {
            throw error;
          });
          const onDegraded = jest.fn();
          const policy = createServicePolicy({
            maxConsecutiveFailures,
            onDegraded,
          });

          const promise = policy.execute(mockService);
          // It's safe not to await this promise; adding it to the promise queue
          // is enough to prevent this test from running indefinitely.
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          clock.runAllAsync();
          await ignoreRejection(promise);

          expect(onDegraded).toHaveBeenCalledTimes(1);
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
          // It's safe not to await this promise; adding it to the promise queue
          // is enough to prevent this test from running indefinitely.
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          clock.runAllAsync();

          await expect(promise).rejects.toThrow(error);
        });

        it('calls the onBreak callback once with the error', async () => {
          const maxConsecutiveFailures = DEFAULT_MAX_RETRIES + 1;
          const error = new Error('failure');
          const mockService = jest.fn(() => {
            throw error;
          });
          const onBreak = jest.fn();
          const policy = createServicePolicy({
            maxConsecutiveFailures,
            onBreak,
          });

          const promise = policy.execute(mockService);
          // It's safe not to await this promise; adding it to the promise queue
          // is enough to prevent this test from running indefinitely.
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          clock.runAllAsync();
          await ignoreRejection(promise);

          expect(onBreak).toHaveBeenCalledTimes(1);
          expect(onBreak).toHaveBeenCalledWith({ error });
        });

        it('never calls the onDegraded callback, since the circuit is open', async () => {
          const maxConsecutiveFailures = DEFAULT_MAX_RETRIES + 1;
          const error = new Error('failure');
          const mockService = jest.fn(() => {
            throw error;
          });
          const onDegraded = jest.fn();
          const policy = createServicePolicy({
            maxConsecutiveFailures,
            onDegraded,
          });

          const promise = policy.execute(mockService);
          // It's safe not to await this promise; adding it to the promise queue
          // is enough to prevent this test from running indefinitely.
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          clock.runAllAsync();
          await ignoreRejection(promise);

          expect(onDegraded).not.toHaveBeenCalled();
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
          // It's safe not to await this promise; adding it to the promise queue
          // is enough to prevent this test from running indefinitely.
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
          // It's safe not to await this promise; adding it to the promise queue
          // is enough to prevent this test from running indefinitely.
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
          const error = new Error('failure');
          const mockService = jest.fn(() => {
            throw error;
          });
          const onBreak = jest.fn();
          const policy = createServicePolicy({
            maxConsecutiveFailures,
            onBreak,
          });

          const promise = policy.execute(mockService);
          // It's safe not to await this promise; adding it to the promise queue
          // is enough to prevent this test from running indefinitely.
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          clock.runAllAsync();
          await ignoreRejection(promise);

          expect(onBreak).toHaveBeenCalledTimes(1);
          expect(onBreak).toHaveBeenCalledWith({ error });
        });

        it('never calls the onDegraded callback, since the circuit is open', async () => {
          const maxConsecutiveFailures = DEFAULT_MAX_RETRIES;
          const error = new Error('failure');
          const mockService = jest.fn(() => {
            throw error;
          });
          const onDegraded = jest.fn();
          const policy = createServicePolicy({
            maxConsecutiveFailures,
            onDegraded,
          });

          const promise = policy.execute(mockService);
          // It's safe not to await this promise; adding it to the promise queue
          // is enough to prevent this test from running indefinitely.
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          clock.runAllAsync();
          await ignoreRejection(promise);

          expect(onDegraded).not.toHaveBeenCalled();
        });
      });
    });
  });

  describe('wrapping a service that fails continuously and then succeeds on the final try', () => {
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

      const promise = policy.execute(mockService);
      // It's safe not to await this promise; adding it to the promise queue is
      // enough to prevent this test from running indefinitely.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      clock.runAllAsync();
      await promise;

      expect(mockService).toHaveBeenCalledTimes(1 + DEFAULT_MAX_RETRIES);
    });

    it('calls the onRetry callback once per retry', async () => {
      let invocationCounter = 0;
      const mockService = jest.fn(() => {
        invocationCounter += 1;
        if (invocationCounter === DEFAULT_MAX_RETRIES + 1) {
          return { some: 'data' };
        }
        throw new Error('failure');
      });
      const onRetry = jest.fn();
      const policy = createServicePolicy({ onRetry });

      const promise = policy.execute(mockService);
      // It's safe not to await this promise; adding it to the promise queue is
      // enough to prevent this test from running indefinitely.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      clock.runAllAsync();
      await promise;

      expect(onRetry).toHaveBeenCalledTimes(DEFAULT_MAX_RETRIES);
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
        const onBreak = jest.fn();
        const policy = createServicePolicy({ onBreak });

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
        const onBreak = jest.fn();
        const policy = createServicePolicy({ onBreak });

        const promise = policy.execute(mockService);
        // It's safe not to await this promise; adding it to the promise queue
        // is enough to prevent this test from running indefinitely.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        clock.runAllAsync();
        await promise;

        expect(onBreak).not.toHaveBeenCalled();
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
          const onDegraded = jest.fn();
          const policy = createServicePolicy({ onDegraded });

          const promise = policy.execute(mockService);
          // It's safe not to await this promise; adding it to the promise queue
          // is enough to prevent this test from running indefinitely.
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          clock.runAllAsync();
          await promise;

          expect(onDegraded).not.toHaveBeenCalled();
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
          const onDegraded = jest.fn();
          const policy = createServicePolicy({ onDegraded });

          const promise = policy.execute(mockService);
          // It's safe not to await this promise; adding it to the promise queue
          // is enough to prevent this test from running indefinitely.
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          clock.runAllAsync();
          await promise;

          expect(onDegraded).toHaveBeenCalledTimes(1);
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
          const onDegraded = jest.fn();
          const policy = createServicePolicy({
            onDegraded,
            degradedThreshold,
          });

          const promise = policy.execute(mockService);
          // It's safe not to await this promise; adding it to the promise queue
          // is enough to prevent this test from running indefinitely.
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          clock.runAllAsync();
          await promise;

          expect(onDegraded).not.toHaveBeenCalled();
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
          const onDegraded = jest.fn();
          const policy = createServicePolicy({
            onDegraded,
            degradedThreshold,
          });

          const promise = policy.execute(mockService);
          // It's safe not to await this promise; adding it to the promise queue
          // is enough to prevent this test from running indefinitely.
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          clock.runAllAsync();
          await promise;

          expect(onDegraded).toHaveBeenCalledTimes(1);
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
          const onBreak = jest.fn();
          const policy = createServicePolicy({
            maxConsecutiveFailures,
            onBreak,
          });

          const promise = policy.execute(mockService);
          // It's safe not to await this promise; adding it to the promise queue
          // is enough to prevent this test from running indefinitely.
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
          const onBreak = jest.fn();
          const policy = createServicePolicy({
            maxConsecutiveFailures,
            onBreak,
          });

          const promise = policy.execute(mockService);
          // It's safe not to await this promise; adding it to the promise queue
          // is enough to prevent this test from running indefinitely.
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          clock.runAllAsync();
          await promise;

          expect(onBreak).not.toHaveBeenCalled();
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
            const onDegraded = jest.fn();
            const policy = createServicePolicy({
              maxConsecutiveFailures,
              onDegraded,
            });

            const promise = policy.execute(mockService);
            // It's safe not to await this promise; adding it to the promise
            // queue is enough to prevent this test from running indefinitely.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            clock.runAllAsync();
            await promise;

            expect(onDegraded).not.toHaveBeenCalled();
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
            const onDegraded = jest.fn();
            const policy = createServicePolicy({
              maxConsecutiveFailures,
              onDegraded,
            });

            const promise = policy.execute(mockService);
            // It's safe not to await this promise; adding it to the promise
            // queue is enough to prevent this test from running indefinitely.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            clock.runAllAsync();
            await promise;

            expect(onDegraded).toHaveBeenCalledTimes(1);
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
            const onDegraded = jest.fn();
            const policy = createServicePolicy({
              maxConsecutiveFailures,
              onDegraded,
              degradedThreshold,
            });

            const promise = policy.execute(mockService);
            // It's safe not to await this promise; adding it to the promise
            // queue is enough to prevent this test from running indefinitely.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            clock.runAllAsync();
            await promise;

            expect(onDegraded).not.toHaveBeenCalled();
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
            const onDegraded = jest.fn();
            const policy = createServicePolicy({
              maxConsecutiveFailures,
              onDegraded,
              degradedThreshold,
            });

            const promise = policy.execute(mockService);
            // It's safe not to await this promise; adding it to the promise
            // queue is enough to prevent this test from running indefinitely.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            clock.runAllAsync();
            await promise;

            expect(onDegraded).toHaveBeenCalledTimes(1);
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
          const onBreak = jest.fn();
          const policy = createServicePolicy({
            maxConsecutiveFailures,
            onBreak,
          });

          const promise = policy.execute(mockService);
          // It's safe not to await this promise; adding it to the promise queue
          // is enough to prevent this test from running indefinitely.
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
          const onBreak = jest.fn();
          const policy = createServicePolicy({
            maxConsecutiveFailures,
            onBreak,
          });

          const promise = policy.execute(mockService);
          // It's safe not to await this promise; adding it to the promise queue
          // is enough to prevent this test from running indefinitely.
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          clock.runAllAsync();
          await promise;

          expect(onBreak).not.toHaveBeenCalled();
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
            const onDegraded = jest.fn();
            const policy = createServicePolicy({
              maxConsecutiveFailures,
              onDegraded,
            });

            const promise = policy.execute(mockService);
            // It's safe not to await this promise; adding it to the promise
            // queue is enough to prevent this test from running indefinitely.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            clock.runAllAsync();
            await promise;

            expect(onDegraded).not.toHaveBeenCalled();
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
            const onDegraded = jest.fn();
            const policy = createServicePolicy({
              maxConsecutiveFailures,
              onDegraded,
            });

            const promise = policy.execute(mockService);
            // It's safe not to await this promise; adding it to the promise
            // queue is enough to prevent this test from running indefinitely.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            clock.runAllAsync();
            await promise;

            expect(onDegraded).toHaveBeenCalledTimes(1);
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
            const onDegraded = jest.fn();
            const policy = createServicePolicy({
              maxConsecutiveFailures,
              onDegraded,
              degradedThreshold,
            });

            const promise = policy.execute(mockService);
            // It's safe not to await this promise; adding it to the promise
            // queue is enough to prevent this test from running indefinitely.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            clock.runAllAsync();
            await promise;

            expect(onDegraded).not.toHaveBeenCalled();
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
            const onDegraded = jest.fn();
            const policy = createServicePolicy({
              maxConsecutiveFailures,
              onDegraded,
              degradedThreshold,
            });

            const promise = policy.execute(mockService);
            // It's safe not to await this promise; adding it to the promise
            // queue is enough to prevent this test from running indefinitely.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            clock.runAllAsync();
            await promise;

            expect(onDegraded).toHaveBeenCalledTimes(1);
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
          const onBreak = jest.fn();
          const policy = createServicePolicy({
            maxConsecutiveFailures,
            onBreak,
          });

          const promise = policy.execute(mockService);
          // It's safe not to await this promise; adding it to the promise queue
          // is enough to prevent this test from running indefinitely.
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
          const onBreak = jest.fn();
          const policy = createServicePolicy({
            maxConsecutiveFailures,
            onBreak,
          });

          const promise = policy.execute(mockService);
          // It's safe not to await this promise; adding it to the promise queue
          // is enough to prevent this test from running indefinitely.
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          clock.runAllAsync();
          await ignoreRejection(promise);

          expect(onBreak).toHaveBeenCalledTimes(1);
          expect(onBreak).toHaveBeenCalledWith({ error });
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
          const onDegraded = jest.fn();
          const policy = createServicePolicy({
            maxConsecutiveFailures,
            onDegraded,
          });

          const promise = policy.execute(mockService);
          // It's safe not to await this promise; adding it to the promise queue
          // is enough to prevent this test from running indefinitely.
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          clock.runAllAsync();
          await ignoreRejection(promise);

          expect(onDegraded).not.toHaveBeenCalled();
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
