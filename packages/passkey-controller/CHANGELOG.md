# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release ([#8422](https://github.com/MetaMask/core/pull/8422))
  - `PasskeyController` for passkey-based vault key protection with WebAuthn, AES-256-GCM wrap/unwrap, and HKDF-derived keys; optional `userName` / `userDisplayName` for the OS passkey UI (default `rpName`); constructor defaults `state` to `{}`
  - Enrollment and unlock: `generateRegistrationOptions` / `protectVaultKeyWithPasskey`, `generateAuthenticationOptions` / `retrieveVaultKeyWithPasskey`, `renewVaultKeyProtection`, `removePasskey`, `clearState`; `verifyPasskeyAuthentication` validates authentication without returning the vault key
  - `isPasskeyEnrolled` and `passkeyControllerSelectors.selectIsPasskeyEnrolled`; `destroy` / `removePasskey` / `clearState` clear in-flight ceremony state
  - Adaptive enrollment key derivation (WebAuthn **PRF** or **userHandle** fallback); self-contained verification (`clientDataJSON` / `authenticatorData`, RSA signatures via `@noble/curves` and Web Crypto; attestation `none` and `packed` self-attestation)
  - Challenge-keyed in-memory ceremony coordination (`CeremonyManager`), timing/limit constants exported from the package entry (`WEBAUTHN_TIMEOUT_MS`, `CEREMONY_TTL_SLACK_MS`, `CEREMONY_MAX_AGE_MS`, `MAX_CONCURRENT_PASSKEY_CEREMONIES`)
  - `PasskeyAuthenticationRejectedError` for expected failures; `verifyAuthenticationResponse` returns a discriminated union on success vs failure
  - Exported controller and WebAuthn types, AES-GCM helpers, and COSE enums (`COSEALG`, `COSEKEYS`, `COSEKTY`, `COSECRV`)

[Unreleased]: https://github.com/MetaMask/core/
