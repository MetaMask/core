// Types for the custom matchers in `tests/matchers.ts`, which
// `tests/vitest/setup-after-env.ts` registers. The Jest side of the same
// declaration lives in `types/global.d.ts`.
//
// The `export {}` is what makes this file a module, which in turn makes the
// `declare module` below an augmentation. Without it, TypeScript would treat the
// block as an ambient declaration of `vitest` itself and every other export of
// the package, `vi` included, would disappear.
export {};

declare module 'vitest' {
  // The type parameters have to mirror Vitest's own declaration exactly, and
  // Vitest 5 changed them from `<T = any>` to `<Result, Actual>`, so this has to
  // be kept in step across major versions. `Result` is what the assertion
  // returns, which for both of these matchers the caller awaits.
  /* oxlint-disable-next-line typescript/consistent-type-definitions */
  interface Matchers<
    Result extends void | Promise<void> = void | Promise<void>,
    Actual = unknown,
  > {
    toBeFulfilled(): Result;
    toNeverResolve(): Result;
  }
}
