import { createSHA256Hash } from '../../../shared/encryption';
import type { Env } from '../../../shared/env';

export const IDENTIFIER_SALT: Record<Env, string> = {
  dev: 'Baiche1eu8Oa2een5ieReul0Phooph4e',
  uat: 'wooG2Nahd4juviiw7cooxa7ekaeNgeik',
  prd: 'oCheThi4lohv5choGhuosh1aiT2phioF',
};

/**
 * Computes a deterministic identifier ID by hashing a public key with an
 * environment-specific salt. Matches the server-side formula:
 * SHA256(publicKey + salt).
 *
 * @param publicKey - The raw SRP public key
 * @param env - The environment whose salt to use
 * @returns The hex-encoded SHA256 hash used as identifier_id
 */
export function computeIdentifierId(publicKey: string, env: Env): string {
  const salt = IDENTIFIER_SALT[env];
  if (!salt) {
    throw new Error('Cannot compute identifier ID: invalid environment');
  }
  return createSHA256Hash(publicKey + salt);
}
