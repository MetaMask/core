/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { PasskeyController } from './PasskeyController';

/**
 * Whether a passkey is enrolled and vault key material is stored.
 *
 * @returns `true` if enrolled, otherwise `false`.
 */
export type PasskeyControllerIsPasskeyEnrolledAction = {
  type: `PasskeyController:isPasskeyEnrolled`;
  handler: PasskeyController['isPasskeyEnrolled'];
};

/**
 * Builds WebAuthn credential creation options for passkey enrollment.
 *
 * @param creationOptionsConfig - Optional creation behavior.
 * @param creationOptionsConfig.prfAvailable - Request the PRF extension unless `false`. Defaults to `true`.
 * @returns Public key credential creation options for `navigator.credentials.create()`.
 */
export type PasskeyControllerGenerateRegistrationOptionsAction = {
  type: `PasskeyController:generateRegistrationOptions`;
  handler: PasskeyController['generateRegistrationOptions'];
};

/**
 * Builds WebAuthn credential request options for the post-registration
 * authentication step (between `create` and {@link protectVaultKeyWithPasskey}).
 *
 * @param params - Input for the pending registration ceremony.
 * @param params.registrationResponse - Result of `navigator.credentials.create()`.
 * @returns Public key credential request options for `navigator.credentials.get()`.
 */
export type PasskeyControllerGeneratePostRegistrationAuthenticationOptionsAction =
  {
    type: `PasskeyController:generatePostRegistrationAuthenticationOptions`;
    handler: PasskeyController['generatePostRegistrationAuthenticationOptions'];
  };

/**
 * Builds WebAuthn credential request options for the enrolled passkey.
 *
 * @returns Public key credential request options for `navigator.credentials.get()`.
 */
export type PasskeyControllerGenerateAuthenticationOptionsAction = {
  type: `PasskeyController:generateAuthenticationOptions`;
  handler: PasskeyController['generateAuthenticationOptions'];
};

/**
 * Verifies registration and post-registration authentication, then stores the
 * vault key encrypted under the new passkey.
 *
 * @param params - Enrollment completion inputs.
 * @param params.registrationResponse - Result of `navigator.credentials.create()`.
 * @param params.authenticationResponse - Result of `navigator.credentials.get()` after {@link generatePostRegistrationAuthenticationOptions}.
 * @param params.vaultKey - Vault encryption key to encrypt and persist.
 * @param params.password - Wallet password when onboarding is complete (step-up).
 */
export type PasskeyControllerProtectVaultKeyWithPasskeyAction = {
  type: `PasskeyController:protectVaultKeyWithPasskey`;
  handler: PasskeyController['protectVaultKeyWithPasskey'];
};

/**
 * Verifies an authentication assertion and returns the decrypted vault key.
 *
 * @param authenticationResponse - Result of `navigator.credentials.get()`.
 * @returns The plaintext vault encryption key.
 */
export type PasskeyControllerRetrieveVaultKeyWithPasskeyAction = {
  type: `PasskeyController:retrieveVaultKeyWithPasskey`;
  handler: PasskeyController['retrieveVaultKeyWithPasskey'];
};

/**
 * Checks whether the given authentication assertion is valid for the enrolled passkey.
 *
 * On failure, returns `false` for {@link PasskeyControllerError} with a `code`;
 * other errors propagate.
 *
 * @param authenticationResponse - Result of `navigator.credentials.get()`.
 * @returns `true` if verification succeeds, otherwise `false`.
 */
export type PasskeyControllerVerifyPasskeyAuthenticationAction = {
  type: `PasskeyController:verifyPasskeyAuthentication`;
  handler: PasskeyController['verifyPasskeyAuthentication'];
};

/**
 * Re-wraps the vault key after rotation. Updates persisted `encryptedVaultKey` on success.
 *
 * Does not verify WebAuthn or ceremony state—call only after your layer has authenticated
 * the user (passkey `get()` + verified assertion, or verified password). On passkey paths,
 * pass the same `authenticationResponse` you just verified (e.g. from
 * {@link retrieveVaultKeyWithPasskey} / {@link verifyPasskeyAuthentication}).
 *
 * @param params - Re-wrap inputs.
 * @param params.authenticationResponse - Used to derive the wrapping key.
 * @param params.oldVaultKey - Expected current vault key.
 * @param params.newVaultKey - New vault key to encrypt under the passkey.
 */
export type PasskeyControllerRenewVaultKeyProtectionAction = {
  type: `PasskeyController:renewVaultKeyProtection`;
  handler: PasskeyController['renewVaultKeyProtection'];
};

/**
 * Clears enrolled passkey state and in-flight ceremonies. Call only after the same
 * auth gate as renewal (verified passkey assertion or password).
 */
export type PasskeyControllerRemovePasskeyAction = {
  type: `PasskeyController:removePasskey`;
  handler: PasskeyController['removePasskey'];
};

/**
 * Resets state and clears in-flight registration/authentication ceremonies.
 */
export type PasskeyControllerClearStateAction = {
  type: `PasskeyController:clearState`;
  handler: PasskeyController['clearState'];
};

/**
 * Releases all in-flight ceremony state and tears down the messenger.
 */
export type PasskeyControllerDestroyAction = {
  type: `PasskeyController:destroy`;
  handler: PasskeyController['destroy'];
};

/**
 * Union of all PasskeyController action types.
 */
export type PasskeyControllerMethodActions =
  | PasskeyControllerIsPasskeyEnrolledAction
  | PasskeyControllerGenerateRegistrationOptionsAction
  | PasskeyControllerGeneratePostRegistrationAuthenticationOptionsAction
  | PasskeyControllerGenerateAuthenticationOptionsAction
  | PasskeyControllerProtectVaultKeyWithPasskeyAction
  | PasskeyControllerRetrieveVaultKeyWithPasskeyAction
  | PasskeyControllerVerifyPasskeyAuthenticationAction
  | PasskeyControllerRenewVaultKeyProtectionAction
  | PasskeyControllerRemovePasskeyAction
  | PasskeyControllerClearStateAction
  | PasskeyControllerDestroyAction;
