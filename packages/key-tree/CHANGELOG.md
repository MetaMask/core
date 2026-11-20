# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Bump `@scure/base` from `^1.2.6` to `^2.4.0` ([#10596](https://github.com/MetaMask/core/pull/10596))

## [11.0.0]

### Changed

- **BREAKING:** Drop CommonJS support ([#11361](https://github.com/MetaMask/core/pull/11361))
  - The package is now ESM-only. The `require` export condition and the `main`, `module`, and `types` fields are removed, and `exports` only has `types` and `default` conditions.
  - Consumers that load this package with `require()` must switch to `import`, or use a Node.js version that supports `require(esm)`.
- **BREAKING:** Bump minimum supported Node.js version to `^22.14.0 || ^24 || ^26` ([#11361](https://github.com/MetaMask/core/pull/11361))
- **BREAKING:** Compile to `ES2022` instead of `ES2020` ([#11360](https://github.com/MetaMask/core/pull/11360))
  - Consumers that bundle this package for environments that do not support `ES2022` must transpile it.
- **BREAKING:** Replace cryptography implementations with `@metamask/cryptography` ([#11395](https://github.com/MetaMask/core/pull/11395))
  - The custom `cryptographicFunctions` option was removed. Consumers that passed it must stop doing so, as the package now always uses `@metamask/cryptography`.
- **BREAKING:** Replace curve objects with simple objects containing only the curve parameters ([#11395](https://github.com/MetaMask/core/pull/11395))
- **BREAKING:** Make `getPublicKey` on `secp256k1`, `ed25519`, and `ed25519Bip32` curves asynchronous ([#11453](https://github.com/MetaMask/core/pull/11453))
- **BREAKING:** Derive `ed25519` public keys using `@metamask/cryptography` ([#11453](https://github.com/MetaMask/core/pull/11453))
- All functions now use `Uint8Array<ArrayBuffer>` instead of `Uint8Array` ([#11395](https://github.com/MetaMask/core/pull/11395))
  - `Uint8Array`s backed by a `SharedArrayBuffer` were never properly supported, so this only makes the types reflect the existing runtime behaviour.
- Replace the `@metamask/utils` dependency with `@metamask/byte-utils` and `@metamask/type-utils` ([#11361](https://github.com/MetaMask/core/pull/11361))
- Bump `@noble/curves` from `^1.8.1` to `^1.9.7`, `@noble/hashes` from `^1.3.2` to `^1.8.0`, and `@scure/base` from `^1.0.0` to `^1.2.6` ([#11361](https://github.com/MetaMask/core/pull/11361))
- This package was migrated from `MetaMask/key-tree` to the `MetaMask/core` monorepo ([#11354](https://github.com/MetaMask/core/pull/11354), [#11367](https://github.com/MetaMask/core/pull/11367))
  - See [`MetaMask/key-tree`](https://github.com/MetaMask/key-tree/blob/742c995fa27144d038941df5bddbc7351ee0e8ff/CHANGELOG.md) for the original changelog.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/key-tree@11.0.0...HEAD
[11.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/key-tree@11.0.0
