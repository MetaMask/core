# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `PasskeyController` constructor accepts optional `userName` and `userDisplayName` so consumers can override the values shown in the OS passkey UI; both default to `rpName`. ([#8422](https://github.com/MetaMask/core/pull/8422))
- `PasskeyController.destroy()` clears in-flight ceremony state in addition to the standard `BaseController` teardown. ([#8422](https://github.com/MetaMask/core/pull/8422))
- `passkeyControllerSelectors.selectIsPasskeyEnrolled` selector for use in Redux selectors and other code paths that only have access to a state object. ([#8422](https://github.com/MetaMask/core/pull/8422))
- `PasskeyController.verifyPasskeyAuthentication` — returns whether the passkey authentication response is valid without returning the vault key (delegates to the same path as `retrieveVaultKeyWithPasskey`). ([#8422](https://github.com/MetaMask/core/pull/8422))
- Initial `@metamask/passkey-controller` package: passkey-based vault key protection using WebAuthn, orchestrating enrollment, authentication, and vault key wrap/unwrap with AES-256-GCM and HKDF-derived keys. ([#8422](https://github.com/MetaMask/core/pull/8422))
- `PasskeyController` API: ([#8422](https://github.com/MetaMask/core/pull/8422))
  - `generateRegistrationOptions` / `protectVaultKeyWithPasskey` — enrollment and vault key protection
  - `generateAuthenticationOptions` / `retrieveVaultKeyWithPasskey` — unlock and vault key recovery
  - `renewVaultKeyProtection` — re-wrap vault key for password-change flows without re-enrolling the passkey
  - `removePasskey` — unenroll and clear key material
  - `isPasskeyEnrolled` — enrollment check (also available as `passkeyControllerSelectors.selectIsPasskeyEnrolled`)
  - `clearState` — reset persisted state and clear in-flight WebAuthn ceremony state (for app lifecycle, e.g. wallet reset)
- Adaptive key derivation during enrollment: **PRF** (WebAuthn PRF extension output as HKDF input) or **userHandle** fallback; PRF path used only when `prf.results.first` is a non-empty string. ([#8422](https://github.com/MetaMask/core/pull/8422))
- Self-contained WebAuthn verification (no Node server): `clientDataJSON` and `authenticatorData` checks, signature verification (`@noble/curves` + Web Crypto RSA), attestation formats `none` and `packed` self-attestation. ([#8422](https://github.com/MetaMask/core/pull/8422))
- In-flight **ceremony** coordination (distinct from user login sessions): challenge-keyed registration/authentication state in `src/ceremony-manager.ts` (`CeremonyManager` and timing/capacity constants), TTL aligned with WebAuthn `timeout`, and a cap on concurrent ceremonies per flow so multiple tabs/contexts do not overwrite a single in-memory entry. ([#8422](https://github.com/MetaMask/core/pull/8422))
- Exported timing and limits from package entry: `WEBAUTHN_TIMEOUT_MS`, `CEREMONY_TTL_SLACK_MS`, `CEREMONY_MAX_AGE_MS`, `MAX_CONCURRENT_PASSKEY_CEREMONIES` (`PasskeyController` does not re-export these; import from `@metamask/passkey-controller` or `./ceremony-manager` in the monorepo). ([#8422](https://github.com/MetaMask/core/pull/8422))
- Exported controller types (`PasskeyControllerState`, messenger types, actions, events) and WebAuthn option/response types; internal ceremony payload types `PasskeyRegistrationCeremony` / `PasskeyAuthenticationCeremony` in `types.ts`. ([#8422](https://github.com/MetaMask/core/pull/8422))
- AES-256-GCM helpers and COSE enums (`COSEALG`, `COSEKEYS`, `COSEKTY`, `COSECRV`). ([#8422](https://github.com/MetaMask/core/pull/8422))
- `PasskeyAuthenticationRejectedError` for expected authentication or enrollment failures (not enrolled, missing ceremony, failed verification, missing key material, vault decrypt failure). `PasskeyController.verifyPasskeyAuthentication` returns `false` only for this error and rethrows anything else. ([#8422](https://github.com/MetaMask/core/pull/8422))
- `renewVaultKeyProtection` throws `PasskeyAuthenticationRejectedError('Passkey is not enrolled')` when called without an enrolled passkey instead of an opaque `TypeError`. ([#8422](https://github.com/MetaMask/core/pull/8422))
- `verifyAuthenticationResponse` returns a discriminated union (`{ verified: false }` or `{ verified: true; authenticationInfo }`) so consumers cannot accidentally read `authenticationInfo` on a failed verification; signature verification failure short-circuits before the counter-monotonicity check. ([#8422](https://github.com/MetaMask/core/pull/8422))
- `PasskeyController` constructor defaults `state` to `{}` per controller guidelines. ([#8422](https://github.com/MetaMask/core/pull/8422))
- `PasskeyController.isPasskeyEnrolled` delegates to `passkeyControllerSelectors.selectIsPasskeyEnrolled`. ([#8422](https://github.com/MetaMask/core/pull/8422))
- `PasskeyController.removePasskey` clears in-flight ceremony state (same as `clearState` for the ceremony manager). ([#8422](https://github.com/MetaMask/core/pull/8422))

[Unreleased]: https://github.com/MetaMask/core/
