# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial `@metamask/passkey-controller` ([#8422](https://github.com/MetaMask/core/pull/8422)): `PasskeyController` for WebAuthn passkey vault key protection (HKDF-derived keys, AES-256-GCM wrap/unwrap), PRF or `userHandle` derivation, challenge-keyed `CeremonyManager`, enrollment/unlock/renewal flows, `verifyPasskeyAuthentication`, selectors, and exported ceremony timing constants.
- `PasskeyControllerError` with stable `code`, optional `cause` / `context`, `toJSON`, and `toString`; `PasskeyControllerErrorCode`, `PasskeyControllerErrorMessage`, and `controllerName`. Replaces `PasskeyAuthenticationRejectedError`—use `PasskeyControllerError` and `code` for auth failures.
- **BREAKING:** Operational error messages are prefixed with `PasskeyController - `; prefer `code` or `instanceof PasskeyControllerError` over matching raw strings.
- `renewVaultKeyProtection` uses the same `vault_key_decryption_failed` code as `retrieveVaultKeyWithPasskey` when AES-GCM decrypt fails.
- Thrown failures from `verifyRegistrationResponse` / `verifyAuthenticationResponse` are wrapped in `PasskeyControllerError` with `registration_verification_failed` / `authentication_verification_failed` and the underlying error as `cause` (aligned with the `verified: false` path).
- Debug logging (via `@metamask/utils`) for registration/authentication verification failures, missing ceremony state, vault decrypt failures, and vault key mismatch during renewal.

### Fixed

- Registration verification requires the credential `id`/`rawId` to match the credential id in authenticator data; vault wrapping key derivation uses that verified credential id so enrollment keys align with the stored credential.
- Registration options request attestation conveyance `'none'` so clients are not asked for direct attestation formats the verifier does not implement (`none` and self-attested `packed` only).

[Unreleased]: https://github.com/MetaMask/core/
