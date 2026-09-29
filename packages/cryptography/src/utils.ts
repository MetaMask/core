/**
 * Convert a `BufferSource` to a `Uint8Array` view over the same bytes.
 *
 * @param source - The `ArrayBuffer`, typed array, or `DataView` to convert.
 * @returns A `Uint8Array` sharing memory with the source.
 */
export function toUint8Array(source: BufferSource): Uint8Array<ArrayBuffer> {
  if (source instanceof ArrayBuffer) {
    return new Uint8Array(source);
  }
  return new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
}

/**
 * Build the 16-byte PKCS8 header for a private key.
 * https://www.rfc-editor.org/rfc/rfc8410#section-7
 *
 * @param oid - The 3-byte curve OID.
 * @returns The PKCS8 header.
 */
export function buildPKCS8Header(
  oid: [number, number, number],
): Uint8Array<ArrayBuffer> {
  return new Uint8Array([
    0x30,
    0x2e,
    0x02,
    0x01,
    0x00,
    0x30,
    0x05,
    0x06,
    0x03,
    ...oid,
    0x04,
    0x22,
    0x04,
    0x20,
  ]);
}

/**
 * Wrap a raw private key in a PKCS8 envelope.
 *
 * @param header - The algorithm-specific PKCS8 header.
 * @param key - The raw key bytes to wrap.
 * @returns The complete PKCS8 envelope.
 */
export function wrapInPKCS8(
  header: Uint8Array,
  key: BufferSource,
): Uint8Array<ArrayBuffer> {
  const pkcs8 = new Uint8Array(header.length + key.byteLength);
  pkcs8.set(header);
  pkcs8.set(toUint8Array(key), header.length);
  return pkcs8;
}
