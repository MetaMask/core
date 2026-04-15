import { base64URLToBytes } from '../encoding';

export type ClientDataJSON = {
  type: string;
  challenge: string;
  origin: string;
  crossOrigin?: boolean;
  tokenBinding?: {
    id?: string;
    status: 'present' | 'supported' | 'not-supported';
  };
};

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
