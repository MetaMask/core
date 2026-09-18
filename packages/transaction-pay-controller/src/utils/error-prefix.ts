/**
 * Prefix an error message while preserving the original Error object and stack.
 *
 * @param error - Error or thrown value to prefix.
 * @param prefix - Prefix to prepend when missing.
 * @returns The prefixed Error object.
 */
export function prefixError(error: unknown, prefix: string): Error {
  if (error instanceof Error) {
    if (!error.message.startsWith(prefix)) {
      error.message = `${prefix}${error.message}`;
    }

    return error;
  }

  return new Error(`${prefix}${String(error)}`);
}
