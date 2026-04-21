/**
 * Thrown when passkey authentication or vault-key recovery fails in an
 * expected operational way (not enrolled, no ceremony, bad assertion, missing
 * key material, decrypt failure).
 */
export class PasskeyAuthenticationRejectedError extends Error {
  override readonly name = 'PasskeyAuthenticationRejectedError';
}
