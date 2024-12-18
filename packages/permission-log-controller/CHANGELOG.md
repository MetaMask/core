# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- chore: bump nanoid dependency ([#5073](https://github.com/MetaMask/core/pull/5073))

## [3.0.2]

### Changed

- Bump `@metamask/utils` from `^9.1.0` to `^10.0.0` ([#4831](https://github.com/MetaMask/core/pull/4831))
- Bump `@metamask/base-controller` from `^7.0.1` to `^7.0.2` ([#4862](https://github.com/MetaMask/core/pull/4862))
- Bump `@metamask/json-rpc-engine` from `^9.0.3` to `^10.0.1` ([#4798](https://github.com/MetaMask/core/pull/4798), [#4862](https://github.com/MetaMask/core/pull/4862))

### Fixed

- Correct ESM-compatible build so that imports of the following packages that re-export other modules via `export *` are no longer corrupted: ([#5011](https://github.com/MetaMask/core/pull/5011))
  - `deep-freeze-strict`

## [3.0.1]

### Changed

- Bump `@metamask/utils` from `^8.3.0` to `^9.1.0` ([#4516](https://github.com/MetaMask/core/pull/4516), [#4529](https://github.com/MetaMask/core/pull/4529))
- Bump `@metamask/rpc-errors` from `^6.2.1` to `^6.3.1` ([#4516](https://github.com/MetaMask/core/pull/4516))
- Bump TypeScript from `~4.9.5` to `~5.2.2` and set `moduleResolution` option to `Node16` ([#3645](https://github.com/MetaMask/core/pull/3645), [#4576](https://github.com/MetaMask/core/pull/4576), [#4584](https://github.com/MetaMask/core/pull/4584))

### Fixed

- Produce and export ESM-compatible TypeScript type declaration files in addition to CommonJS-compatible declaration files ([#4648](https://github.com/MetaMask/core/pull/4648))
  - Previously, this package shipped with only one variant of type declaration
    files, and these files were only CommonJS-compatible, and the `exports`
    field in `package.json` linked to these files. This is an anti-pattern and
    was rightfully flagged by the
    ["Are the Types Wrong?"](https://arethetypeswrong.github.io/) tool as
    ["masquerading as CJS"](https://github.com/arethetypeswrong/arethetypeswrong.github.io/blob/main/docs/problems/FalseCJS.md).
    All of the ATTW checks now pass.
- Remove chunk files ([#4648](https://github.com/MetaMask/core/pull/4648)).
  - Previously, the build tool we used to generate JavaScript files extracted
    common code to "chunk" files. While this was intended to make this package
    more tree-shakeable, it also made debugging more difficult for our
    development teams. These chunk files are no longer present.

## [3.0.0]

### Changed

- **BREAKING:** Bump minimum Node version to 18.18 ([#3611](https://github.com/MetaMask/core/pull/3611))
- Bump `@metamask/base-controller` to `^6.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- Bump `@metamask/json-rpc-engine` to `^9.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))

## [2.0.2]

### Changed

- Bump `@metamask/base-controller` to `^5.0.2` ([#4234](https://github.com/MetaMask/core/pull/4234))
- Bump `@metamask/json-rpc-engine` to `^8.0.2` ([#4232](https://github.com/MetaMask/core/pull/4232))

## [2.0.1]

### Fixed

- Fix `types` field in `package.json` ([#4047](https://github.com/MetaMask/core/pull/4047))

## [2.0.0]

### Added

- **BREAKING**: Add ESM build ([#3998](https://github.com/MetaMask/core/pull/3998))
  - It's no longer possible to import files from `./dist` directly.

### Changed

- **BREAKING:** Bump `@metamask/base-controller` to `^5.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
  - This version has a number of breaking changes. See the changelog for more.
- Bump `@metamask/json-rpc-engine` to `^8.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))

## [1.0.0]

### Added

- Initial release

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/permission-log-controller@3.0.2...HEAD
[3.0.2]: https://github.com/MetaMask/core/compare/@metamask/permission-log-controller@3.0.1...@metamask/permission-log-controller@3.0.2
[3.0.1]: https://github.com/MetaMask/core/compare/@metamask/permission-log-controller@3.0.0...@metamask/permission-log-controller@3.0.1
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/permission-log-controller@2.0.2...@metamask/permission-log-controller@3.0.0
[2.0.2]: https://github.com/MetaMask/core/compare/@metamask/permission-log-controller@2.0.1...@metamask/permission-log-controller@2.0.2
[2.0.1]: https://github.com/MetaMask/core/compare/@metamask/permission-log-controller@2.0.0...@metamask/permission-log-controller@2.0.1
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/permission-log-controller@1.0.0...@metamask/permission-log-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/permission-log-controller@1.0.0
