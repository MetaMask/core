import { base64ToBytes, bytesToString } from '@metamask/utils';

/**
 * Pad a base64 string so its length is a multiple of 4.
 *
 * A string that is already a multiple of 4 is returned unchanged.
 *
 * @param input - The base64 string to pad.
 * @returns The padded base64 string.
 */
export function padBase64String(input: string): string {
  // base64 string length should be a multiple of 4
  const segmentLength = 4;
  const stringLength = input.length;
  // number of characters to pad to make the string length a multiple of 4
  const requiredPadLength = segmentLength - (stringLength % segmentLength);
  if (requiredPadLength === segmentLength) {
    // handle the case where the string length is already a multiple of 4
    // in this case, we don't need to pad the string
    return input;
  }

  // total length of the padded string
  const paddedStringLength = stringLength + requiredPadLength;
  const paddedString = input.padEnd(paddedStringLength, '=');
  return paddedString;
}

/**
 * Convert a base64url string to standard base64 and remove padding.
 *
 * `-` and `_` become `+` and `/`.
 *
 * @param base64String - The base64url string to convert.
 * @returns The standard base64 string without padding.
 */
export function convertUrlSafeBase64StringToBase64String(
  base64String: string,
): string {
  return base64String
    .replace(/-/gu, '+')
    .replace(/_/gu, '/')
    .replace(/[=]/gu, '');
}

/**
 * Decode a base64url string to a UTF-8 string.
 *
 * Padding stripped by {@link convertUrlSafeBase64StringToBase64String} is
 * restored before decoding because `@metamask/utils` requires it.
 *
 * @param base64String - The base64url encoded string to decode.
 * @returns The decoded UTF-8 string.
 */
export function decodeBase64WithSafeUrlReplacements(
  base64String: string,
): string {
  // Apply URL-safe replacements to the base64String BEFORE decoding
  const urlSafeBase64String =
    convertUrlSafeBase64StringToBase64String(base64String);
  return bytesToString(base64ToBytes(padBase64String(urlSafeBase64String)));
}

/**
 * Decode the payload of a JWT idToken.
 *
 * The payload is base64url, as issued by the Web3Auth authentication server.
 *
 * @param idToken - The JWT idToken (`header.payload.signature`).
 * @returns The decoded payload as a UTF-8 JSON string.
 */
export function decodeIdToken(idToken: string): string {
  const [, idTokenPayload] = idToken.split('.');
  if (!idTokenPayload) {
    throw new Error('Invalid JWT token format');
  }

  const base64String = convertUrlSafeBase64StringToBase64String(
    padBase64String(idTokenPayload),
  );

  return decodeBase64WithSafeUrlReplacements(base64String);
}
