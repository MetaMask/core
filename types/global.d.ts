declare global {
  // Using `namespace` here is okay because this is how the Jest types are
  // defined.
  /* eslint-disable-next-line @typescript-eslint/no-namespace */
  namespace jest {
    interface Matchers<R> {
      toNeverResolve(): Promise<R>;
    }
  }
}

// Export something so that TypeScript knows to interpret this as a module
export {};
