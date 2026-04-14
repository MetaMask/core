# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **`PasskeyController.rewrapVaultEncryptionKeyAfterPasswordChange`** — verifies a WebAuthn authentication response, confirms the stored passkey wrap decrypts to the pre-rotation vault encryption key, then re-wraps and persists the record for a new serialized encryption key and encryption salt (e.g. after `KeyringController.changePassword`).
- Initial release of `@metamask/passkey-controller`, a controller and helper library for passkey-based wallet unlock (WebAuthn registration/authentication, optional PRF extension, and encrypted vault key wrapping).
- **`PasskeyController`** (`PasskeyController.ts`): extends `BaseController` with persisted `passkeyRecord` and in-memory registration/authentication sessions (challenge and PRF salt material are not part of controller `state`).
  - `generatePasskeyRegistrationOptions` — starts registration, stores session data, returns WebAuthn creation options JSON (platform authenticator, `userVerification: preferred`, `residentKey: preferred`, attestation `direct`, Ed25519 (-8) + ES256 (-7) + RS256 (-257), L3 credential `hints` default `client-device` then `hybrid`, PRF `eval` with a random salt).
  - `completePasskeyRegistration` — verifies the registration challenge in `clientDataJSON`, derives a wrapping key via HKDF (PRF output or `userHandle`), wraps the supplied vault encryption key with AES-GCM, and persists `PasskeyRecord`.
  - `generatePasskeyAuthenticationOptions` — requires an enrolled passkey; stores an auth challenge and returns WebAuthn request options (`userVerification: preferred`, same default `hints`, plus PRF `eval` when the stored record used PRF).
  - `unwrapVaultEncryptionKey` — verifies the authentication challenge, derives the same wrapping key material, and unwraps the stored encryption key.
  - `isPasskeyEnrolled` / `removePasskey` — enrollment status and clearing record plus in-memory sessions.
  - Messenger registers `PasskeyController:isPasskeyEnrolled`; public typings are `PasskeyControllerState` and `PasskeyControllerMessenger`.
- **`getDefaultPasskeyControllerState`** for initializing controller state.
- **Constants** (`constants.ts`): `PASSKEY_HKDF_INFO`, `PASSKEY_DEFAULT_CREDENTIAL_HINTS`.
- **Crypto** (`crypto.ts`): `deriveWrappingKey` (HKDF-SHA256 → AES-256-GCM key), `wrapKey` / `unwrapKey` for the vault encryption string using `PASSKEY_HKDF_INFO`.
- **Encoding** (`encoding.ts`): `arrayBufferToBase64`, `base64ToArrayBuffer`, `bytesToBase64URL`, `decodeBase64UrlString`, `base64UrlStringToArrayBuffer` (WebAuthn base64url wire decoding for HKDF inputs).
- **WebAuthn** (`webauthn.ts`): `webauthnWireBinaryToBytes`, `verifyChallengeInClientData`.
- **Types** (`types.ts`): `PasskeyRecord`, registration/authentication options and response JSON shapes, PRF extension types, and related WebAuthn wire aliases.
- **Unit tests** for `PasskeyController`, `crypto`, `encoding`, and `webauthn`.

### Changed

- Refactored authentication handling so `unwrapVaultEncryptionKey` shares challenge verification and wrapping-key derivation with the new re-wrap path.

[Unreleased]: https://github.com/MetaMask/core/
