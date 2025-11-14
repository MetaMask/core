export const toRejectedErrorMessage = <Result>(
  prefix: string,
  results: PromiseSettledResult<Result>[],
) => {
  let errorMessage = `${prefix}:`;
  for (const r of results) {
    if (r.status === 'rejected') {
      errorMessage += `\n- ${r.reason}`;
    }
  }
  return errorMessage;
};

/**
 * Creates a Sentry error from an error message, an inner error and a context.
 *
 * NOTE: Sentry defaults to a depth of 3 when extracting non-native attributes.
 * As such, the context depth shouldn't be too deep.
 *
 * @param msg - The error message to create a Sentry error from.
 * @param innerError - The inner error to create a Sentry error from.
 * @param context - The context to add to the Sentry error.
 * @returns A Sentry error.
 */
export const createSentryError = (
  msg: string,
  innerError: Error,
  context: Record<string, unknown>,
) => {
  const error = new Error(msg) as Error & {
    cause: Error;
    context: typeof context;
  };
  error.cause = innerError;
  error.context = context;
  return error;
};
