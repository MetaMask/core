# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- fix: restore shebangs on CLI entry points removed during Oxlint migration ([#10463](https://github.com/MetaMask/core/pull/10463))
- chore(lint): apply automatic lint fixes ([#10346](https://github.com/MetaMask/core/pull/10346))
- fix(deps): update dependency deepmerge to ^4.3.1 ([#10437](https://github.com/MetaMask/core/pull/10437))
- chore(deps): bump `execa` to `v10` ([#10332](https://github.com/MetaMask/core/pull/10332))
- chore(deps): update dependency tsx to ^4.23.15 ([#10434](https://github.com/MetaMask/core/pull/10434))
- chore(deps): update dependency tsx to ^4.23.13 ([#10369](https://github.com/MetaMask/core/pull/10369))
- chore(deps): update dependency rimraf to v6 ([#10379](https://github.com/MetaMask/core/pull/10379))
- chore(deps): update dependency @metamask/auto-changelog to ^6.2.1 ([#10364](https://github.com/MetaMask/core/pull/10364))
- chore(deps): update dependency ts-jest to ^29.4.12 ([#10328](https://github.com/MetaMask/core/pull/10328))
- fix(deps): update dependency execa to ^5.1.1 ([#10330](https://github.com/MetaMask/core/pull/10330))
- chore(deps): update dependency rimraf to ^5.0.10 ([#10327](https://github.com/MetaMask/core/pull/10327))
- chore: integrate `@metamask/utils` into `packages/` ([#10185](https://github.com/MetaMask/core/pull/10185))

### Changed

- Bump `@metamask/utils` from `^11.12.0` to `^12.0.0` ([#10192](https://github.com/MetaMask/core/pull/10192))
- Bump `yargs` from `^17.7.2` to `^17.7.3` ([#10446](https://github.com/MetaMask/core/pull/10446))

## [1.0.0]

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/messenger-cli@1.0.0...HEAD
[1.0.0]: https://github.com/MetaMask/core/compare/@metamask/messenger-cli@0.2.0...@metamask/messenger-cli@1.0.0
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/messenger-cli@0.1.0...@metamask/messenger-cli@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/messenger-cli@0.1.0
