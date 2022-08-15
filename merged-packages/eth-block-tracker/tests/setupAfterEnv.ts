declare global {
  // Using `namespace` here is okay because this is how the Jest types are
  // defined.
  /* eslint-disable-next-line @typescript-eslint/no-namespace */
  namespace jest {
    interface Matchers<R> {
      toNeverResolve(): Promise<R>;
    }
  }
}

// Export something so that TypeScript thinks that we are performing type
// augmentation
export {};

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
        'Using `.not.toNeverResolve(...)` is not supported. ' +
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
                ? `was rejected with ${rejectionValue}`
                : `resolved with ${resolutionValue}`
            }`;
          },
          pass: false,
        };
  },
});
