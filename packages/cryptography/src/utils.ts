/**
 * Convert a `BufferSource` to a `Uint8Array` view over the same bytes.
 *
 * @param source - The `ArrayBuffer`, typed array, or `DataView` to convert.
 * @returns A `Uint8Array` sharing memory with the source.
 */
export function toUint8Array(source: BufferSource): Uint8Array {
  if (source instanceof ArrayBuffer) {
    return new Uint8Array(source);
  }
  return new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
}
