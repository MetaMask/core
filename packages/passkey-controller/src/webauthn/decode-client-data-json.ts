import { base64URLToBytes } from '../utils/encoding';
import type { ClientDataJSON } from './types';

/**
 * Decode an authenticator's base64url-encoded clientDataJSON to JSON.
 *
 * @param data - Base64url-encoded clientDataJSON string.
 * @returns Parsed ClientDataJSON object.
 */
export function decodeClientDataJSON(data: string): ClientDataJSON {
  const bytes = base64URLToBytes(data);
  const text = new TextDecoder().decode(bytes);
  return JSON.parse(text) as ClientDataJSON;
}
