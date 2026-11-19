/**
 * Decodes a JWT payload without verifying its signature.
 *
 * Use this only for inspecting claims on a token received from a trusted
 * exchange. Signature verification remains the authorization server's
 * responsibility.
 *
 * @param token - JWT to decode.
 * @returns The parsed payload.
 * @throws If the token or payload is malformed.
 */
export function decodeJwtPayload(token: string): unknown {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) {
    throw new Error('Invalid JWT');
  }

  const base64 = parts[1].replace(/-/gu, '+').replace(/_/gu, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  return JSON.parse(atob(padded));
}
