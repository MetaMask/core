/**
 * Narrows an unknown value to a plain record, for reading optional fields off
 * untrusted data (parsed JSON, decoded JWT payloads) before it has been
 * validated against a struct.
 *
 * @param value - The value to narrow.
 * @returns The value as a record, or undefined if it is not an object.
 */
export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}
