import { MfaRecoveryError } from './errors.js';
import type { IdentifierAuthMode } from './types.js';

/**
 * Trusted identifier-type registry. Escrows and the controller derive the
 * authentication mode from this table, never from a client-selected flag.
 */
export const IDENTIFIER_AUTH_MODES: Record<string, IdentifierAuthMode> = {
  oidc: 'key-bound',
  passkey: 'key-bound',
  siwe: 'key-bound',
  emailOtp: 'escrow-challenge',
  smsOtp: 'escrow-challenge',
};

/**
 * Returns the auth mode for an identifier type.
 *
 * @param type - Identifier type.
 * @returns Auth mode.
 * @throws If the type is not in the trusted registry.
 */
export function getIdentifierAuthMode(type: string): IdentifierAuthMode {
  const mode = IDENTIFIER_AUTH_MODES[type];
  if (mode === undefined) {
    throw new MfaRecoveryError(
      `Unknown identifier type: ${type}`,
      'unknown_identifier_type',
    );
  }
  return mode;
}
