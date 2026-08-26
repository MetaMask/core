// See `tests/setupAfterEnv.ts` for the implementation for these matchers.

declare global {
  // `@types/jest@30` dropped the ambient `jest` value declaration (only the
  // `jest` namespace, used for types like `jest.Mock`, remains). Jest itself
  // still injects the real `jest` object into the global scope at runtime;
  // this restores its type without requiring every file to
  // `import { jest } from '@jest/globals'`.
  var jest: typeof import('@jest/globals').jest;

  namespace jest {
    // We're using `interface` here so that we can extend and not override it.
    // In addition, we must use the generic parameter name `R` to match the
    // Jest types.
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions, @typescript-eslint/naming-convention
    interface Matchers<R> {
      toBeFulfilled(): Promise<R>;
      toNeverResolve(): Promise<R>;
    }
  }
}

// Export something so that TypeScript knows to interpret this as a module
export {};
