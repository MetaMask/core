import { inspect } from 'util';
import { waitForResult } from './helpers';

// Store this up front in case it gets stubbed later
const originalSetTimeout = global.setTimeout;

const UNRESOLVED = Symbol('timedOut');

const TIME_TO_WAIT_UNTIL_UNRESOLVED = 100;

// This has to be less than the testTimeout in the Jest config to guarantee that
// our timeout will get triggered first
const TEST_TIMEOUT = 2000;

/**
 * Produces a sort of dummy promise which can be used in conjunction with a
 * "real" promise to determine whether the "real" promise was ever resolved. If
 * the promise that is produced by this function resolves first, then the other
 * one must be unresolved.
 *
 * @param duration - How long to wait before resolving the promise returned by
 * this function.
 * @returns A promise that resolves to a symbol.
 */
const treatUnresolvedAfter = (duration: number): Promise<typeof UNRESOLVED> => {
  return new Promise((resolve) => {
    originalSetTimeout(resolve, duration, UNRESOLVED);
  });
};

expect.extend({
  /**
   * Tests that the given promise is never fulfilled or rejected past a certain
   * amount of time (which is the default time that Jest tests wait before
   * timing out as configured in the Jest configuration file).
   *
   * Inspired by <https://stackoverflow.com/a/68409467/260771>.
   *
   * @param promise - The promise to test.
   * @returns The result of the matcher.
   */
  async toNeverResolve(promise: Promise<any>) {
    if (this.isNot) {
      throw new Error(
        "`.not.toNeverResolve(...)` isn't supported. " +
          'You probably want to either `await` the promise and test its ' +
          'resolution value or use `.rejects` to test its rejection value instead.',
      );
    }

    let resolutionValue: any;
    let rejectionValue: any;
    try {
      resolutionValue = await Promise.race([
        promise,
        treatUnresolvedAfter(TIME_TO_WAIT_UNTIL_UNRESOLVED),
      ]);
    } catch (e) {
      rejectionValue = e;
    }

    return resolutionValue === UNRESOLVED
      ? {
          message: () =>
            `Expected promise to resolve after ${TIME_TO_WAIT_UNTIL_UNRESOLVED}ms, but it did not`,
          pass: true,
        }
      : {
          message: () => {
            return `Expected promise to never resolve after ${TIME_TO_WAIT_UNTIL_UNRESOLVED}ms, but it ${
              rejectionValue
                ? `was rejected with ${inspect(rejectionValue)}`
                : `resolved with ${inspect(resolutionValue)}`
            }`;
          },
          pass: false,
        };
  },

  async toEventuallyBe(test: () => any, expectedValue: any) {
    if (this.isNot) {
      throw new Error(
        "`.not.toEventuallyBe(...)` isn't supported. Maybe you want to use `.toNeverResolve()` instead?",
      );
    }

    const result = await Promise.race([
      waitForResult(expectedValue, test),
      treatUnresolvedAfter(TEST_TIMEOUT),
    ]);

    if (result === UNRESOLVED) {
      return {
        message: () =>
          `Expected function to eventually return ${inspect(
            expectedValue,
          )} after ${TEST_TIMEOUT}ms, but it did not.`,
        pass: false,
      };
    } else if (result.pass) {
      return {
        message: () => 'This message would get printed if .not were used.',
        pass: true,
      };
    }
    return {
      message: () =>
        `Expected function to eventually return ${inspect(
          expectedValue,
        )}, but it did not. (The last value returned was ${inspect(
          result.lastActualValue,
        )}.)`,
      pass: false,
    };
  },
});
