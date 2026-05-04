# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0]

### Added

- `generatePostRegistrationAuthenticationOptions` to issue `navigator.credentials.get()` options after `navigator.credentials.create()`, keyed to the in-flight registration ceremony (including PRF eval when a salt was used) ([#8663](https://github.com/MetaMask/core/pull/8663))
- `already_enrolled` (`PasskeyControllerErrorCode.AlreadyEnrolled`) when calling `protectVaultKeyWithPasskey` while a passkey is already enrolled ([#8663](https://github.com/MetaMask/core/pull/8663))

### Changed

- **BREAKING:** Enrollment completes in three steps: `generateRegistrationOptions` → `create()` → `generatePostRegistrationAuthenticationOptions` → `get()` → `protectVaultKeyWithPasskey`; `protectVaultKeyWithPasskey` now **requires** `authenticationResponse`, and the vault wrapping key is derived from that post-registration assertion (same path as unlock: PRF when present, otherwise `userHandle`) ([#8663](https://github.com/MetaMask/core/pull/8663))
- **BREAKING:** `PasskeyController` constructor option `rpID` is replaced with `expectedRPID: string | string[]` (normalized to a string array, which may be empty). Optional `rpId` sets `rp.id` / `rpId` in generated WebAuthn options; when omitted, those fields are omitted. Verification passes that array to `verifyRegistrationResponse` / `verifyAuthenticationResponse` as `expectedRPIDs` ([#8663](https://github.com/MetaMask/core/pull/8663))
- **BREAKING:** `verifyRegistrationResponse` and `verifyAuthenticationResponse` now take `expectedRPIDs: string[]` instead of `expectedRPID: string` ([#8663](https://github.com/MetaMask/core/pull/8663))
- `verifyRegistrationResponse` / `verifyAuthenticationResponse` accept an empty `expectedRPIDs` array to skip RP ID hash allowlist matching; successful authentication then reports `authenticationInfo.rpID` as an empty string ([#8663](https://github.com/MetaMask/core/pull/8663))
- Increase `CEREMONY_TTL_SLACK_MS` to 2 minutes so in-flight ceremony state (`CEREMONY_MAX_AGE_MS`, 3 minutes including WebAuthn timeout) tolerates longer gaps between WebAuthn options and completion (e.g. post-registration authentication) ([#8663](https://github.com/MetaMask/core/pull/8663))
- Bump `@metamask/messenger` from `^1.1.1` to `^1.2.0` ([#8632](https://github.com/MetaMask/core/pull/8632))

### Fixed

- `protectVaultKeyWithPasskey` rejects post-registration assertions whose `userHandle` is missing or does not match the in-flight registration ceremony when using `userHandle` key derivation (assertion `userHandle` is not signature-bound) ([#8663](https://github.com/MetaMask/core/pull/8663))

## [1.0.0]

### Added

- Initial `@metamask/passkey-controller`: `PasskeyController` for WebAuthn passkey vault key protection (HKDF-derived keys, AES-256-GCM wrap/unwrap), PRF or `userHandle` derivation, challenge-keyed `CeremonyManager`, enrollment/unlock/renewal flows, `verifyPasskeyAuthentication`, selectors, and exported ceremony timing constants. ([#8422](https://github.com/MetaMask/core/pull/8422))
- `PasskeyControllerError` with stable `code`, optional `cause` / `context`, `toJSON`, and `toString`; `PasskeyControllerErrorCode`, `PasskeyControllerErrorMessage`, and `controllerName`. Replaces `PasskeyAuthenticationRejectedError`—use `PasskeyControllerError` and `code` for auth failures.
- **BREAKING:** Operational error messages are prefixed with `PasskeyController - `; prefer `code` or `instanceof PasskeyControllerError` over matching raw strings.
- `renewVaultKeyProtection` uses the same `vault_key_decryption_failed` code as `retrieveVaultKeyWithPasskey` when AES-GCM decrypt fails.
- Thrown failures from `verifyRegistrationResponse` / `verifyAuthenticationResponse` are wrapped in `PasskeyControllerError` with `registration_verification_failed` / `authentication_verification_failed` and the underlying error as `cause` (aligned with the `verified: false` path).
- Debug logging (via `@metamask/utils`) for registration/authentication verification failures, missing ceremony state, vault decrypt failures, and vault key mismatch during renewal.

### Fixed

- Registration verification requires the credential `id`/`rawId` to match the credential id in authenticator data; vault wrapping key derivation uses that verified credential id so enrollment keys align with the stored credential.
- Registration options request attestation conveyance `'none'` so clients are not asked for direct attestation formats the verifier does not implement (`none` and self-attested `packed` only).

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/passkey-controller@2.0.0...HEAD
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/passkey-controller@1.0.0...@metamask/passkey-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/passkey-controller@1.0.0
