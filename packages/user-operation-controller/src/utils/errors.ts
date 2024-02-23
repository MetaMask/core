/**
 * Prepends the given prefix to the error message.
 *
 * @param error - The error to prefix.
 * @param prefix - The prefix to prepend to the error message.
 * @returns The error with the prefixed message.
 */
export function errorWithPrefix(error: unknown, prefix: string): Error {
  if (error instanceof Error) {
    error.message = `${prefix}: ${error.message}`;
    return error;
  }

  return new Error(`${prefix}: ${String(error)}`);
}
