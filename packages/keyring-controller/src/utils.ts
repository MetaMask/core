/**
 * Throws an error.
 *
 * @param error - Error message or Error object to throw.
 */
export function throwError(error: string | Error): never {
  throw typeof error === 'string' ? new Error(error) : error;
}
