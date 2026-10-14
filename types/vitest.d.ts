// Types for the custom matchers in `tests/matchers.ts`; `types/jest.d.ts` is the
// Jest side. `export {}` makes this a module, and so the block below an
// augmentation rather than a replacement of `vitest` that would wipe out `vi`.
export {};

declare module 'vitest' {
  // These parameters have to mirror Vitest's own declaration exactly, and it
  // changed them in 5, so they need checking on a major bump.
  /* oxlint-disable-next-line typescript/consistent-type-definitions */
  interface Matchers<
    Result extends void | Promise<void> = void | Promise<void>,
    Actual = unknown,
  > {
    toBeFulfilled(): Result;
    toNeverResolve(): Result;
  }
}
