# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **BREAKING:** Drop CommonJS support ([#9536](https://github.com/MetaMask/core/pull/9536))
  - This package is now ESM-only, but can still be used in CommonJS projects via `require(esm)` in modern Node.js versions (22+), or dynamic imports in older Node.js versions.
- **BREAKING:** Bump minimum Node.js version to 22 ([#9976](https://github.com/MetaMask/core/pull/9976))
- **BREAKING:** Bump TypeScript target to ES2022 ([#10019](https://github.com/MetaMask/core/pull/10019))
  - This package now ships ES2022 code, requiring a compatible modern environment or bundler configuration to consume.
- Bump `@metamask/utils` from `^11.9.0` to `^11.12.0` ([#9074](https://github.com/MetaMask/core/pull/9074), [#10076](https://github.com/MetaMask/core/pull/10076))
- Bump `@metamask/controller-utils` from `^11.19.0` to `^12.3.0` ([#8344](https://github.com/MetaMask/core/pull/8344), [#8755](https://github.com/MetaMask/core/pull/8755), [#8774](https://github.com/MetaMask/core/pull/8774), [#9058](https://github.com/MetaMask/core/pull/9058), [#9083](https://github.com/MetaMask/core/pull/9083), [#9218](https://github.com/MetaMask/core/pull/9218))
- Bump `@metamask/messenger` from `^1.1.0` to `^2.0.0` ([#8373](https://github.com/MetaMask/core/pull/8373), [#8632](https://github.com/MetaMask/core/pull/8632), [#9392](https://github.com/MetaMask/core/pull/9392))
- Bump `@metamask/base-controller` from `^9.0.1` to `^9.1.0` ([#8457](https://github.com/MetaMask/core/pull/8457))

[Unreleased]: https://github.com/MetaMask/core/
