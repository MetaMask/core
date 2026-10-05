/**
 * Escape a string for use as a literal inside a regular expression.
 *
 * @param value - The literal text.
 * @returns The escaped pattern.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/**
 * Whether `error` is the one `Messenger.call` throws when no handler is
 * reachable for `actionType`: nothing registered it (`has not been
 * registered`), or the host's messenger did not delegate it
 * (`has not been delegated to <namespace>`).
 *
 * The whole message must match and name `actionType`, so a missing handler
 * deeper in the chain — a delegated handler that itself calls an action its
 * own messenger lacks — stays a real failure rather than reading as an absent
 * optional dependency.
 *
 * @param error - The error thrown by a messenger call.
 * @param actionType - The action the caller attempted.
 * @returns True when `actionType` has no reachable handler.
 */
export function isMissingActionHandlerError(
  error: unknown,
  actionType: string,
): boolean {
  return (
    error instanceof Error &&
    new RegExp(
      `^A handler for ${escapeRegExp(actionType)} has not been (?:registered|delegated to \\S+)$`,
      'u',
    ).test(error.message)
  );
}
