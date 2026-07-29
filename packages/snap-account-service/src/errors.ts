/**
 * Augmented `Error` shape produced by {@link createSentryError}. The runtime
 * value carries a `cause` and (optionally) a structured `context` payload
 * that downstream Sentry tooling can read.
 *
 * The `TContext` type parameter narrows the shape of `context` for callers
 * that know what they put in — most useful in tests when asserting on a
 * captured error.
 */
export type SentryError<
  TContext extends Record<string, unknown> = Record<string, unknown>,
> = Error & {
  cause: Error;
  context?: TContext;
};

/**
 * Creates a Sentry error from an error message, an inner error and a context.
 *
 * NOTE: Sentry defaults to a depth of 3 when extracting non-native attributes.
 * As such, the context depth shouldn't be too deep.
 *
 * @param message - The error message to create a Sentry error from.
 * @param innerError - The inner error to create a Sentry error from.
 * @param context - The context to add to the Sentry error.
 * @returns A Sentry error.
 */
export const createSentryError = <
  TContext extends Record<string, unknown> = Record<string, unknown>,
>(
  message: string,
  innerError: Error,
  context?: TContext,
): SentryError<TContext> => {
  const error = new Error(message) as SentryError<TContext>;
  error.cause = innerError;
  if (context) {
    error.context = context;
  }
  return error;
};

/**
 * Reports an error by logging it to the console and optionally capturing it
 * in Sentry via the messenger's `captureException` method.
 *
 * @param messenger - Object with an optional `captureException` method.
 * @param messenger.captureException - Optional method to capture exceptions in Sentry.
 * @param message - The static message describing what failed.
 * @param error - The caught error.
 * @param context - Optional context to attach to the Sentry error.
 */
export function reportError(
  messenger: { captureException?: (error: Error) => void },
  message: string,
  error: unknown,
  context?: Record<string, unknown>,
): void {
  console.error(message, error);

  const sentryError = createSentryError(message, error as Error, context);
  messenger.captureException?.(sentryError);
}
