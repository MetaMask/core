export const controllerName = 'PasskeyController';

/**
 * Stable programmatic codes for {@link PasskeyControllerError}.
 * Use these instead of matching `message` strings.
 */
export const PasskeyControllerErrorCode = {
  NotEnrolled: 'not_enrolled',
  AlreadyEnrolled: 'already_enrolled',
  NoRegistrationCeremony: 'no_registration_ceremony',
  RegistrationVerificationFailed: 'registration_verification_failed',
  NoAuthenticationCeremony: 'no_authentication_ceremony',
  AuthenticationVerificationFailed: 'authentication_verification_failed',
  MissingKeyMaterial: 'missing_key_material',
  VaultKeyDecryptionFailed: 'vault_key_decryption_failed',
  VaultKeyMismatch: 'vault_key_mismatch',
} as const;

export type PasskeyControllerErrorCode =
  (typeof PasskeyControllerErrorCode)[keyof typeof PasskeyControllerErrorCode];

/**
 * Human-readable messages for {@link PasskeyControllerError}.
 */
export enum PasskeyControllerErrorMessage {
  NotEnrolled = `${controllerName} - Passkey is not enrolled`,
  AlreadyEnrolled = `${controllerName} - Passkey is already enrolled`,
  NoRegistrationCeremony = `${controllerName} - No active passkey registration ceremony`,
  RegistrationVerificationFailed = `${controllerName} - Passkey registration verification failed`,
  NoAuthenticationCeremony = `${controllerName} - No active passkey authentication ceremony`,
  AuthenticationVerificationFailed = `${controllerName} - Passkey authentication verification failed`,
  MissingKeyMaterial = `${controllerName} - Passkey assertion missing required key material`,
  VaultKeyDecryptionFailed = `${controllerName} - Passkey vault key decryption failed`,
  VaultKeyMismatch = `${controllerName} - Passkey authentication does not match the current vault key`,
}
