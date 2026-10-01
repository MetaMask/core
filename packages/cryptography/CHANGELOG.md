# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0]

### Added

- Add an `additionalData` option to AES-GCM `encrypt` and `decrypt` ([#10628](https://github.com/MetaMask/core/pull/10628))
- Allow HKDF functions to derive from an empty input when `unsafeInputKeyingMaterial` is set ([#10628](https://github.com/MetaMask/core/pull/10628))

### Fixed

- Narrow return type for AES `encrypt` function to `Uint8Array<ArrayBuffer>` ([#10623](https://github.com/MetaMask/core/pull/10623))

## [1.0.0]

### Added

- Initial release ([#10282](https://github.com/MetaMask/core/pull/10282), [#10431](https://github.com/MetaMask/core/pull/10431), [#10403](https://github.com/MetaMask/core/pull/10403), [#10468](https://github.com/MetaMask/core/pull/10468), [#10503](https://github.com/MetaMask/core/pull/10503), [#10563](https://github.com/MetaMask/core/pull/10563), [#10506](https://github.com/MetaMask/core/pull/10506), [#10608](https://github.com/MetaMask/core/pull/10608), [#10571](https://github.com/MetaMask/core/pull/10571), [#10572](https://github.com/MetaMask/core/pull/10572), [#10573](https://github.com/MetaMask/core/pull/10573), [#10613](https://github.com/MetaMask/core/pull/10613))
  - Add `sha256`, `sha384`, and `sha512` functions for computing SHA digests exported via `@metamask/cryptography/sha`
  - Add `hmacSha256`, `hmacSha384`, and `hmacSha512` functions for computing HMAC digests exported via `@metamask/cryptography/hmac`
  - Add `pbkdf2Sha256`, `pbkdf2Sha384`, and `pbkdf2Sha512` functions for key derivation exported via `@metamask/cryptography/pbkdf2`
  - Add `hkdfSha256`, `hkdfSha384`, and `hkdfSha512` functions for key derivation exported via `@metamask/cryptography/hkdf`
  - Add `generateKeyPair`, `getPublicKey` and `getSharedSecret` functions for X25519 key derivation exported via `@metamask/cryptography/x25519`
  - Add `generateKeyPair`, `getPublicKey`, `sign`, and `verify` functions for Ed25519 exported via `@metamask/cryptography/ed25519`
  - Add `encrypt` and `decrypt` functions for AES-GCM symmetric encryption exported via `@metamask/cryptography/aes-gcm`
  - Add `getRandomBytes` function for generating cryptographically secure random bytes

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/cryptography@1.1.0...HEAD
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/cryptography@1.0.0...@metamask/cryptography@1.1.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/cryptography@1.0.0
