type WaitForOptions = {
    intervalMs?: number;
    timeoutMs?: number;
};
/**
 * Testing Utility - waitFor. Waits for and checks (at an interval) if assertion is reached.
 *
 * @param assertionFn - assertion function
 * @param options - set wait for options
 * @returns promise that you need to await in tests
 */
export declare const waitFor: (assertionFn: () => void, options?: WaitForOptions) => Promise<void>;
export {};
//# sourceMappingURL=test-utils.d.ts.map