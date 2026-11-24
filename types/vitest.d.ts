/**
 * Types for the custom matchers in `tests/matchers.ts`.
 */

// `export {}` makes this a module, and so the block below an augmentation
// rather than a replacement of `vitest` that would wipe out `vi`.
export {};

declare module 'vitest' {
  // The parameter names have to match Vitest's own declaration, or the two do
  // not merge (TS2428).
  /* oxlint-disable id-length */
  /* oxlint-disable-next-line typescript/consistent-type-definitions */
  interface Matchers<
    R extends void | Promise<void> = void | Promise<void>,
    T = unknown,
  > {
    toBeFulfilled(): Promise<void>;
    toNeverResolve(): Promise<void>;
  }
  /* oxlint-enable id-length */
}
