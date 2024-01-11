/**
 * A deferred Promise.
 *
 * A deferred Promise is one that can be resolved or rejected independently of
 * the Promise construction.
 * @template Result - The result type of the Promise.
 */
export type DeferredPromise<Result = void> = {
  /**
   * The Promise that has been deferred.
   */
  promise: Promise<Result>;
  /**
   * A function that resolves the Promise.
   */
  resolve: (result: Result) => void;
  /**
   * A function that rejects the Promise.
   */
  reject: (error: unknown) => void;
};

/**
 * Create a defered Promise.
 *
 * @param args - The arguments.
 * @param args.suppressUnhandledRejection - This option adds an empty error handler
 * to the Promise to suppress the UnhandledPromiseRejection error. This can be
 * useful if the deferred Promise is sometimes intentionally not used.
 * @returns A deferred Promise.
 * @template Result - The result type of the Promise.
 */
export function createDeferredPromise<Result = void>({
  suppressUnhandledRejection = false,
}: {
  suppressUnhandledRejection?: boolean;
} = {}): DeferredPromise<Result> {
  let resolve: DeferredPromise<Result>['resolve'];
  let reject: DeferredPromise<Result>['reject'];
  const promise = new Promise<Result>(
    (
      innerResolve: DeferredPromise<Result>['resolve'],
      innerReject: DeferredPromise<Result>['reject'],
    ) => {
      resolve = innerResolve;
      reject = innerReject;
    },
  );

  if (suppressUnhandledRejection) {
    promise.catch((_error) => {
      // This handler is used to suppress the UnhandledPromiseRejection error
    });
  }

  // @ts-expect-error We know that these are assigned, but TypeScript doesn't
  return { promise, resolve, reject };
}
