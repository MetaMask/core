declare global {
  // Using `namespace` here is okay because this is how the Jest types are
  // defined.
  namespace jest {
    // We have to use `interface` here to extend `Matchers`
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface Matchers<R> {
      toNeverResolve(): Promise<R>;
    }
  }
}

// Export something so that TypeScript knows to interpret this as a module
export {};
