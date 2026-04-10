import { decodeBase64UrlString } from './encoding';
import type { Base64URLString as PasskeyBase64URLString } from './types';

export function webauthnWireBinaryToBytes(wire: unknown): Uint8Array {
  if (typeof wire === 'string') {
    return decodeBase64UrlString(wire);
  }
  if (wire instanceof ArrayBuffer) {
    return new Uint8Array(wire);
  }
  if (ArrayBuffer.isView(wire)) {
    const view = wire;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  if (Array.isArray(wire)) {
    return Uint8Array.from(wire as number[]);
  }
  throw new TypeError(
    'webauthnWireBinaryToBytes: expected base64url string or binary buffer',
  );
}

export function verifyChallengeInClientData(
  clientDataJSONWire: unknown,
  expectedChallenge: PasskeyBase64URLString,
  expectedType: 'webauthn.create' | 'webauthn.get',
): boolean {
  let parsed: { type?: unknown; challenge?: unknown };
  try {
    const jsonBytes = webauthnWireBinaryToBytes(clientDataJSONWire);
    const jsonText = new TextDecoder().decode(jsonBytes);
    parsed = JSON.parse(jsonText) as { type?: unknown; challenge?: unknown };
  } catch {
    return false;
  }

  if (parsed.type !== expectedType || typeof parsed.challenge !== 'string') {
    return false;
  }

  return parsed.challenge === expectedChallenge;
}
