const UNRESOLVED = Symbol('timedOut');
// Store this in case it gets stubbed later
const originalSetTimeout = global.setTimeout;
const TIME_TO_WAIT_UNTIL_UNRESOLVED = 100;

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
   * Tests that the given promise is fulfilled within a certain amount of time
   * (which is the default time that Jest tests wait before timing out as
   * configured in the Jest configuration file).
   *
   * Inspired by <https://stackoverflow.com/a/68409467/260771>.
   *
   * @param promise - The promise to test.
   * @returns The result of the matcher.
   */
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async toBeFulfilled(promise: Promise<any>) {
    if (this.isNot) {
      throw new Error(
        "Using `.not.toBeFulfilled(...)` is not supported. Use `.rejects` to test the promise's rejection value instead.",
      );
    }

    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rejectionValue: any = UNRESOLVED;
    try {
      await promise;
    } catch (e) {
      rejectionValue = e;
    }

    if (rejectionValue !== UNRESOLVED) {
      return {
        message: () =>
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `Expected promise to be fulfilled, but it was rejected with ${rejectionValue}.`,
        pass: false,
      };
    }

    return {
      message: () =>
        'This message should not be displayed as it is for the negative case, which will never happen.',
      pass: true,
    };
  },

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
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async toNeverResolve(promise: Promise<any>) {
    if (this.isNot) {
      throw new Error(
        'Using `.not.toNeverResolve(...)` is not supported. ' +
          'You probably want to either `await` the promise and test its ' +
          'resolution value or use `.rejects` to test its rejection value instead.',
      );
    }

    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let resolutionValue: any;
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
              // TODO: Either fix this lint violation or explain why it's necessary to ignore.
              /* eslint-disable @typescript-eslint/restrict-template-expressions */
              rejectionValue
                ? `was rejected with ${rejectionValue}`
                : `resolved with ${resolutionValue}`
              /* eslint-enable @typescript-eslint/restrict-template-expressions */
            }`;
          },
          pass: false,
        };
  },
});
