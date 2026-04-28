# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial `@metamask/passkey-controller` ([#8422](https://github.com/MetaMask/core/pull/8422)).
- `PasskeyController` for WebAuthn passkey vault key protection: synchronous `generateRegistrationOptions` / `generateAuthenticationOptions` (challenge-keyed in-memory ceremonies), `protectVaultKeyWithPasskey` for enrollment, `retrieveVaultKeyWithPasskey` for unlock, `renewVaultKeyProtection` for re-wrapping the vault key after the caller has verified the same assertion, and `verifyPasskeyAuthentication` when you need a boolean check without returning the vault key.
- AES-256-GCM wrapping of the vault encryption key; wrapping keys from HKDF-SHA256 over PRF extension output when present, otherwise the random `userHandle` created at registration, with the verified credential id as HKDF salt.
- Bounded in-flight ceremony storage (WebAuthn timeout plus TTL slack, and a cap on concurrent ceremonies per flow).
- `PasskeyControllerError` with stable `PasskeyControllerErrorCode` / `PasskeyControllerErrorMessage`, including wrapped registration and authentication verification failures with `cause`.
- `passkeyControllerSelectors` and `getDefaultPasskeyControllerState` for Redux-style consumers; package `README` covers setup, flows, errors, and constructor options.

[Unreleased]: https://github.com/MetaMask/core/
