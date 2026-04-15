import { base64URLToBytes } from './encoding';
import type { Base64URLString as PasskeyBase64URLString } from './types';

export function verifyChallengeInClientData(
  clientDataJSON: PasskeyBase64URLString,
  expectedChallenge: PasskeyBase64URLString,
  expectedType: 'webauthn.create' | 'webauthn.get',
): boolean {
  let parsed: { type?: unknown; challenge?: unknown };
  try {
    const jsonBytes = base64URLToBytes(clientDataJSON);
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
