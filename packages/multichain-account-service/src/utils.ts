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
export const createSentryError = (
  message: string,
  innerError: Error,
  context?: Record<string, unknown>,
): Error => {
  const error = new Error(message) as Error & {
    cause: Error;
    context: typeof context;
  };
  error.cause = innerError;
  if (context) {
    error.context = context;
  }
  return error;
};

/**
 * Converts an unknown error value to a string message.
 *
 * @param error - The error to convert.
 * @returns The error message if the error is an `Error` instance, otherwise
 * the string representation of the value.
 */
export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
