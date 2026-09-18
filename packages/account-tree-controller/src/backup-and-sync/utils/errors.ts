/**
 * Extracts a string message from an unknown error value.
 *
 * @param error - The caught error value.
 * @returns The error message string.
 */
export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
