/**
 * Converts a byte array to a base64 encoded string.
 *
 * @param byteArray - The byte array to convert.
 * @returns The base64 encoded string.
 */
export function byteArrayToBase64(byteArray: Uint8Array) {
  return Buffer.from(byteArray).toString('base64');
}

/**
 * Converts a base64 encoded string to a byte array.
 *
 * @param base64 - The base64 encoded string to convert.
 * @returns The byte array representation of the base64 string.
 */
export function base64ToByteArray(base64: string) {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

/**
 * Converts a byte array to a UTF-8 encoded string.
 *
 * @param byteArray - The byte array to convert.
 * @returns The UTF-8 encoded string.
 */
export function bytesToUtf8(byteArray: Uint8Array) {
  const decoder = new TextDecoder('utf-8');
  return decoder.decode(byteArray);
}
