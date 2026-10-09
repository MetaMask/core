/**
 * Whether an error, or any error in its `cause` chain, matches. SDKs wrap
 * wallet failures in their own errors and keep the original as `cause`.
 *
 * @param error - The caught error.
 * @param predicate - The test for one error in the chain.
 * @returns True when an error in the chain matches.
 */
export function hasErrorInCauseChain(
  error: unknown,
  predicate: (error: Error) => boolean,
): boolean {
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current instanceof Error && !seen.has(current)) {
    if (predicate(current)) {
      return true;
    }
    seen.add(current);
    current = current.cause;
  }
  return false;
}
