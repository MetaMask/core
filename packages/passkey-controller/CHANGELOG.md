# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Bump `@metamask/messenger` from `^1.1.1` to `^1.2.0` ([#8632](https://github.com/MetaMask/core/pull/8632))

## [1.0.0]

### Added

- Add initial version of `@metamask/passkey-controller` ([#8422](https://github.com/MetaMask/core/pull/8422))
  - `PasskeyController` for WebAuthn passkey vault key protection (HKDF-derived keys, AES-256-GCM wrap/unwrap), PRF or `userHandle` derivation, challenge-keyed `CeremonyManager`, enrollment/unlock/renewal flows, `verifyPasskeyAuthentication`, selectors, and exported ceremony timing constants.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/passkey-controller@1.0.0...HEAD
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/passkey-controller@1.0.0
