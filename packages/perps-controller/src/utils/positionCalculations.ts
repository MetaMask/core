/**
 * Side of a position from its signed size.
 *
 * @param size - Signed position size (`Position.size`): positive long, negative short.
 * @returns `long` or `short`, or undefined for a zero or unreadable size.
 */
export function getPositionDirection(
  size: number | string,
): 'long' | 'short' | undefined {
  const signedSize = Number.parseFloat(String(size));
  if (!Number.isFinite(signedSize) || signedSize === 0) {
    return undefined;
  }
  return signedSize > 0 ? 'long' : 'short';
}
