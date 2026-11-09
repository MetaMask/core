# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- chore(key-tree): move to `packages` ([#11367](https://github.com/MetaMask/core/pull/11367))

### Changed

- **BREAKING:** Drop CommonJS support ([#11361](https://github.com/MetaMask/core/pull/11361))
  - The package is now ESM-only. The `require` export condition and the `main`, `module`, and `types` fields are removed, and `exports` only has `types` and `default` conditions.
  - Consumers that load this package with `require()` must switch to `import`, or use a Node.js version that supports `require(esm)`.
- **BREAKING:** Bump minimum supported Node.js version to `^22.14.0 || ^24 || ^26` ([#11361](https://github.com/MetaMask/core/pull/11361))
- **BREAKING:** Compile to `ES2022` instead of `ES2020` ([#11360](https://github.com/MetaMask/core/pull/11360))
  - Consumers that bundle this package for environments that do not support `ES2022` must transpile it.
- Replace the `@metamask/utils` dependency with `@metamask/byte-utils` and `@metamask/type-utils` ([#11361](https://github.com/MetaMask/core/pull/11361))
- Bump `@noble/curves` from `^1.8.1` to `^1.9.7`, `@noble/hashes` from `^1.3.2` to `^1.8.0`, and `@scure/base` from `^1.0.0` to `^1.2.6` ([#11361](https://github.com/MetaMask/core/pull/11361))
- This package was migrated from `MetaMask/key-tree` to the `MetaMask/core` monorepo ([#11354](https://github.com/MetaMask/core/pull/11354))
  - See [`MetaMask/key-tree`](https://github.com/MetaMask/key-tree/blob/742c995fa27144d038941df5bddbc7351ee0e8ff/CHANGELOG.md) for the original changelog.

[Unreleased]: https://github.com/MetaMask/core/
