// See `tests/setupAfterEnv.ts` for the implementation for these matchers.

declare namespace jest {
  // We're using `interface` here so that we can extend and not override it.
  // In addition, we must use the generic parameter name `R` to match the
  // Jest types.
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions, @typescript-eslint/naming-convention
  interface Matchers<R> {
    toBeFulfilled(): Promise<R>;
    toNeverResolve(): Promise<R>;
  }
}
