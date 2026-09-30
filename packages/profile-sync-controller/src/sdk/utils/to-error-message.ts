/**
 * Extracts a human-readable message from a caught value.
 *
 * @param error - The caught value.
 * @returns The error's message, or its string form when it is not an Error.
 */
export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
