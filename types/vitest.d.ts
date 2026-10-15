// Types for the custom matchers in `tests/matchers.ts`; `types/jest.d.ts` is the
// Jest side. `export {}` makes this a module, and so the block below an
// augmentation rather than a replacement of `vitest` that would wipe out `vi`.
export {};

declare module 'vitest' {
  // The parameter names have to match Vitest's own declaration, or the two do
  // not merge (TS2428). Vitest changed them in 5, so check on a major bump.
  /* oxlint-disable id-length */
  /* oxlint-disable-next-line typescript/consistent-type-definitions */
  interface Matchers<
    R extends void | Promise<void> = void | Promise<void>,
    T = unknown,
  > {
    toBeFulfilled(): R;
    toNeverResolve(): R;
  }
  /* oxlint-enable id-length */
}
