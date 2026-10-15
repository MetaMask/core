// See `tests/matchers.ts` for the implementation of these matchers, and
// `tests/setupAfterEnv/matchers.ts` for where they are registered.

declare namespace jest {
  // We're using `interface` here so that we can extend and not override it.
  // In addition, we must use the generic parameter name `R` to match the
  // Jest types.
  // oxlint-disable-next-line typescript/consistent-type-definitions, @typescript-eslint/naming-convention
  interface Matchers<R> {
    toBeFulfilled(): Promise<R>;
    toNeverResolve(): Promise<R>;
  }
}
