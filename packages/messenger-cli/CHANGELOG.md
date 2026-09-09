# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `--esm` flag for ESM-compatible import extensions ([#9572](https://github.com/MetaMask/core/pull/9572))
  - When `--esm` is set, the generated files will have `.js` import extensions.

### Changed

- **BREAKING:** Drop CommonJS support ([#9536](https://github.com/MetaMask/core/pull/9536))
  - This package is now ESM-only, but can still be used in CommonJS projects via `require(esm)` in modern Node.js versions (22+), or dynamic imports in older Node.js versions.
- **BREAKING:** Bump minimum Node.js version to 22 ([#9976](https://github.com/MetaMask/core/pull/9976))
- **BREAKING:** Bump TypeScript target to ES2022 ([#10019](https://github.com/MetaMask/core/pull/10019))
  - This package now ships ES2022 code, requiring a compatible modern environment or bundler configuration to consume.
- Bump `@metamask/utils` from `^11.9.0` to `^11.12.0` ([#9074](https://github.com/MetaMask/core/pull/9074), [#10076](https://github.com/MetaMask/core/pull/10076))

## [0.2.0]

### Added

- **BREAKING:** Add support for formatting the generated method action type files with Prettier or Oxfmt ([#8486](https://github.com/MetaMask/core/pull/8486))
  - This adds a `--formatter` option to the CLI, which accepts either `oxfmt` or
    `prettier` (default).
  - ESLint is no longer used to format the generated files, and is no longer a
    (peer) dependency of this package.

## [0.1.0]

### Added

- Initial release, extracted from `@metamask/messenger` ([#8378](https://github.com/MetaMask/core/pull/8378))
  - CLI tool for generating TypeScript action type files for controllers and services that define `MESSENGER_EXPOSED_METHODS`.
  - Available as a CLI binary (`messenger-action-types`).

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/messenger-cli@0.2.0...HEAD
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/messenger-cli@0.1.0...@metamask/messenger-cli@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/messenger-cli@0.1.0
