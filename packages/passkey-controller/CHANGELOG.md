# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial `@metamask/passkey-controller` package: passkey-based vault key protection using WebAuthn, orchestrating enrollment, authentication, and vault key wrap/unwrap with AES-256-GCM and HKDF-derived keys.
- `PasskeyController` API:
  - `generateRegistrationOptions` / `protectVaultKeyWithPasskey` — enrollment and vault key protection
  - `generateAuthenticationOptions` / `retrieveVaultKeyWithPasskey` — unlock and vault key recovery
  - `renewVaultKeyProtection` — re-wrap vault key for password-change flows without re-enrolling the passkey
  - `removePasskey` — unenroll and clear key material
  - `isPasskeyEnrolled` — enrollment check (exposed via messenger)
  - `clearState` — reset persisted state and clear in-flight WebAuthn ceremony state (for app lifecycle, e.g. wallet reset)
- Adaptive key derivation during enrollment: **PRF** (WebAuthn PRF extension output as HKDF input) or **userHandle** fallback; PRF path used only when `prf.results.first` is a non-empty string.
- Self-contained WebAuthn verification (no Node server): `clientDataJSON` and `authenticatorData` checks, signature verification (`@noble/curves` + Web Crypto RSA), attestation formats `none` and `packed` self-attestation.
- In-flight **ceremony** coordination (distinct from user login sessions): challenge-keyed registration/authentication state in `src/ceremony-manager.ts` (`CeremonyManager` and timing/capacity constants), TTL aligned with WebAuthn `timeout`, and a cap on concurrent ceremonies per flow so multiple tabs/contexts do not overwrite a single in-memory entry.
- Exported timing and limits from package entry: `WEBAUTHN_TIMEOUT_MS`, `SESSION_TTL_SLACK_MS`, `SESSION_MAX_AGE_MS`, `MAX_CONCURRENT_PASSKEY_CEREMONIES` (`PasskeyController` does not re-export these; import from `@metamask/passkey-controller` or `./ceremony-manager` in the monorepo).
- Exported controller types (`PasskeyControllerState`, messenger types, actions, events) and WebAuthn option/response types; internal ceremony payload types `PasskeyRegistrationCeremony` / `PasskeyAuthenticationCeremony` in `types.ts`.
- AES-256-GCM helpers and COSE enums (`COSEALG`, `COSEKEYS`, `COSEKTY`, `COSECRV`).

[Unreleased]: https://github.com/MetaMask/core/
