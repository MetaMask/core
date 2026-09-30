# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release ([#10282](https://github.com/MetaMask/core/pull/10282), [#10431](https://github.com/MetaMask/core/pull/10431), [#10403](https://github.com/MetaMask/core/pull/10403), [#10468](https://github.com/MetaMask/core/pull/10468), [#10503](https://github.com/MetaMask/core/pull/10503), [#10563](https://github.com/MetaMask/core/pull/10563), [#10506](https://github.com/MetaMask/core/pull/10506))
  - Add `sha256`, `sha384`, and `sha512` functions for computing SHA digests
  - Add `hmacSha256`, `hmacSha384`, and `hmacSha512` functions for computing HMAC digests
  - Add `pbkdf2Sha256`, `pbkdf2Sha384`, and `pbkdf2Sha512` functions for key derivation
  - Add `hkdfSha256`, `hkdfSha384`, and `hkdfSha512` functions for key derivation
  - Add `getPublicKey` and `getSharedSecret` functions for X25519 key derivation exported via `@metamask/cryptography/x25519`
  - Add `getRandomBytes` function for generating cryptographically secure random bytes
  - Add `getPublicKey`, `sign`, and `verify` functions for Ed25519 exported via `@metamask/cryptography/ed25519`

[Unreleased]: https://github.com/MetaMask/core/
