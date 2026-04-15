# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Full WebAuthn response verification for both registration and authentication, ported from `@simplewebauthn/server`:
  - `clientDataJSON` verification: `type`, `challenge`, `origin`
  - `authenticatorData` verification: `rpIdHash` (SHA-256 comparison), flags (`up`, `uv`), counter monotonicity
  - Signature verification against stored credential public key using `@noble/curves` (EC2/EdDSA) and Web Crypto API (RSA fallback)
  - Attestation format support: `none` and `packed` self-attestation
- `publicKey` field on `PasskeyRecord` — stores the COSE-encoded credential public key (base64url) for signature verification during authentication
- `transports` field on `PasskeyRecord` — stores authenticator transport hints for `allowCredentials`
- COSE constant enums: `COSEALG`, `COSEKEYS`, `COSEKTY`, `COSECRV`
- Internal `helpers/` directory with verification utilities: `decodeClientDataJSON`, `parseAuthenticatorData`, `decodeAttestationObject`, `verifySignature`, `matchExpectedRPID`
- `rpID` and `expectedOrigin` constructor parameters for `PasskeyController`
- `@levischuck/tiny-cbor` dependency for CBOR decoding of attestation objects and COSE public keys
- `@noble/curves` dependency for EC2 (P-256, P-384) and EdDSA (Ed25519) signature verification
- `PasskeyController.renewVaultKeyProtection` — verifies a WebAuthn authentication response, confirms the currently protected vault key matches the pre-rotation value, then re-protects and persists the record for a new vault encryption key
- Self-contained WebAuthn types: `PasskeyRegistrationOptions`, `PasskeyRegistrationResponse`, `PasskeyAuthenticationOptions`, `PasskeyAuthenticationResponse`, `AuthenticatorTransportFuture`, `Base64URLString`
- Comprehensive test suite with 81 tests including real cryptographic signature verification (ES256, ES384, Ed25519, RS256, RS384, RS512)

### Changed

- **BREAKING:** `generateRegistrationOptions` is now synchronous (was async with `@simplewebauthn/server`)
- **BREAKING:** `generateAuthenticationOptions` is now synchronous (was async with `@simplewebauthn/server`)
- **BREAKING:** All WebAuthn types are now self-contained (no longer re-exported from `@simplewebauthn/server`)
- **BREAKING:** HKDF `info` label used by `deriveEncryptionKey` is now `metamask:passkey:encryption-key:v1`
- Registration and authentication options are now generated internally (challenge, userHandle, PRF salt are self-generated using `@noble/ciphers/webcrypto` randomBytes)
- Refactored authentication handling so `retrieveVaultKeyWithPasskey` shares challenge verification and wrapping-key derivation with the vault key protection renewal path

### Removed

- **BREAKING:** Removed `@simplewebauthn/server` dependency (Node.js package incompatible with browser extension runtime)
- **BREAKING:** Removed `PASSKEY_HKDF_INFO` from the package public exports

[Unreleased]: https://github.com/MetaMask/core/
