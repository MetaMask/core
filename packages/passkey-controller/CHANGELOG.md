# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `PasskeyController` — manages passkey-based vault key protection using WebAuthn, orchestrating the full passkey lifecycle:
  - `generateRegistrationOptions` — produces WebAuthn credential creation options for passkey enrollment
  - `protectVaultKeyWithPasskey` — verifies a registration response and encrypts the vault key with the new credential
  - `generateAuthenticationOptions` — produces WebAuthn credential request options for passkey authentication
  - `retrieveVaultKeyWithPasskey` — verifies an authentication response and recovers the vault encryption key
  - `renewVaultKeyProtection` — re-encrypts the vault key for password-change flows without re-enrolling the passkey
  - `removePasskey` — unenrolls the passkey and clears all stored key material
  - `isPasskeyEnrolled` — returns whether a passkey is currently enrolled
- Adaptive key derivation with two strategies selected automatically during enrollment:
  - **PRF** — uses the WebAuthn PRF extension output as HKDF input key material
  - **userHandle** — falls back to a random userHandle when PRF is unavailable
- Self-contained WebAuthn verification (no Node.js server dependencies):
  - `clientDataJSON` verification: `type`, `challenge`, `origin`
  - `authenticatorData` verification: `rpIdHash` (SHA-256 comparison), flags (`up`, `uv`), counter monotonicity
  - Signature verification against stored credential public key using `@noble/curves` (EC2/EdDSA) and Web Crypto API (RSA fallback)
  - Attestation format support: `none` and `packed` self-attestation
- AES-256-GCM encryption utilities for vault key wrapping with HKDF-SHA256 key derivation
- Exported types: `PasskeyControllerState`, `PasskeyControllerMessenger`, `PasskeyControllerGetStateAction`, `PasskeyControllerIsPasskeyEnrolledAction`, `PasskeyControllerActions`, `PasskeyControllerStateChangeEvent`, `PasskeyControllerEvents`
- Self-contained WebAuthn types: `PasskeyRegistrationOptions`, `PasskeyRegistrationResponse`, `PasskeyAuthenticationOptions`, `PasskeyAuthenticationResponse`
- COSE constant enums: `COSEALG`, `COSEKEYS`, `COSEKTY`, `COSECRV`

[Unreleased]: https://github.com/MetaMask/core/
