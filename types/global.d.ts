// See `tests/setupAfterEnv.ts` for the implementation for these matchers.

declare global {
  // Using `namespace` here is okay because this is how the Jest types are
  // defined.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    // We're using `interface` here so that we can extend and not override it.
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions, @typescript-eslint/naming-convention
    interface Matchers<R> {
      toBeFulfilled(): Promise<R>;
      toNeverResolve(): Promise<R>;
    }
  }
}

// Export something so that TypeScript knows to interpret this as a module
export {};
