# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add support for Node.js 26 ([#10981](https://github.com/MetaMask/core/pull/10981))

### Changed

- Bump `@metamask/utils` from `^11.12.0` to `^12.0.1` ([#10192](https://github.com/MetaMask/core/pull/10192), [#11107](https://github.com/MetaMask/core/pull/11107))

## [9.0.0]

### Changed

- **BREAKING:** Drop CommonJS support ([#9536](https://github.com/MetaMask/core/pull/9536))
  - This package is now ESM-only, but can still be used in CommonJS projects via `require(esm)` in modern Node.js versions (22+), or dynamic imports in older Node.js versions.
- **BREAKING:** Bump minimum Node.js version to 22 ([#9976](https://github.com/MetaMask/core/pull/9976))
- **BREAKING:** Bump TypeScript target to ES2022 ([#10019](https://github.com/MetaMask/core/pull/10019))
  - This package now ships ES2022 code, requiring a compatible modern environment or bundler configuration to consume.
- Bump `@metamask/utils` from `^11.8.1` to `^11.12.0` ([#7511](https://github.com/MetaMask/core/pull/7511), [#9074](https://github.com/MetaMask/core/pull/9074), [#10076](https://github.com/MetaMask/core/pull/10076))
- Bump `@metamask/json-rpc-engine` from `^10.1.1` to `^11.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202), [#7642](https://github.com/MetaMask/core/pull/7642), [#7856](https://github.com/MetaMask/core/pull/7856), [#8078](https://github.com/MetaMask/core/pull/8078), [#8317](https://github.com/MetaMask/core/pull/8317), [#8661](https://github.com/MetaMask/core/pull/8661), [#8746](https://github.com/MetaMask/core/pull/8746), [#8753](https://github.com/MetaMask/core/pull/8753), [#10160](https://github.com/MetaMask/core/pull/10160))

## [8.0.8]

### Changed

- Bump `@metamask/utils` from `^11.2.0` to `^11.8.1` ([#6054](https://github.com/MetaMask/core/pull/6054), [#6588](https://github.com/MetaMask/core/pull/6588), [#6708](https://github.com/MetaMask/core/pull/6708))
- Bump `@metamask/json-rpc-engine` from `^10.0.3` to `^10.1.1` ([#6678](https://github.com/MetaMask/core/pull/6678), [#6807](https://github.com/MetaMask/core/pull/6807))

## [8.0.7]

### Changed

- Bump `@metamask/json-rpc-engine` from `^10.0.2` to `^10.0.3` ([#5272](https://github.com/MetaMask/core/pull/5272))
- Bump `@metamask/utils` from `^11.0.1` to `^11.1.0` ([#5223](https://github.com/MetaMask/core/pull/5223))

## [8.0.6]

### Changed

- Bump `@metamask/json-rpc-engine` from `^10.0.1` to `^10.0.2` ([#5082](https://github.com/MetaMask/core/pull/5082))
- Bump `@metamask/utils` from `^10.0.0` to `^11.0.1` ([#5080](https://github.com/MetaMask/core/pull/5080))

## [8.0.5]

### Changed

- Bump `@metamask/utils` from `^9.1.0` to `^10.0.0` ([#4831](https://github.com/MetaMask/core/pull/4831))

## [8.0.4]

### Fixed

- Bump `@metamask/json-rpc-engine` to `^10.0.0` ([#4798](https://github.com/MetaMask/core/pull/4798))

## [8.0.3]

### Changed

- Bump TypeScript from `~5.0.4` to `~5.2.2` ([#4576](https://github.com/MetaMask/core/pull/4576), [#4584](https://github.com/MetaMask/core/pull/4584))

### Fixed

- Produce and export ESM-compatible TypeScript type declaration files in addition to CommonJS-compatible declaration files ([#4648](https://github.com/MetaMask/core/pull/4648))
  - Previously, this package shipped with only one variant of type declaration
    files, and these files were only CommonJS-compatible, and the `exports`
    field in `package.json` linked to these files. This is an anti-pattern and
    was rightfully flagged by the
    ["Are the Types Wrong?"](https://arethetypeswrong.github.io/) tool as
    ["masquerading as CJS"](https://github.com/arethetypeswrong/arethetypeswrong.github.io/blob/main/docs/problems/FalseCJS.md).
    All of the ATTW checks now pass.
- Remove chunk files. ([#4648](https://github.com/MetaMask/core/pull/4648))
  - Previously, the build tool we used to generate JavaScript files extracted
    common code to "chunk" files. While this was intended to make this package
    more tree-shakeable, it also made debugging more difficult for our
    development teams. These chunk files are no longer present.

## [8.0.2]

### Changed

- Bump TypeScript version to `~5.0.4` and set `moduleResolution` option to `Node16` ([#3645](https://github.com/MetaMask/core/pull/3645))
- Bump `@metamask/utils` from `^9.0.0` to `^9.1.0` ([#4529](https://github.com/MetaMask/core/pull/4529))

## [8.0.1]

### Changed

- Bump `@metamask/json-rpc-engine` to `^9.0.1` ([#4517](https://github.com/MetaMask/core/pull/4517))
- Bump `@metamask/rpc-errors` to `^6.3.1` ([#4516](https://github.com/MetaMask/core/pull/4516))
- Bump `@metamask/utils` to `^9.0.0` ([#4516](https://github.com/MetaMask/core/pull/4516))

### Fixed

- Fix incorrect notification detection logic ([#4427](https://github.com/MetaMask/core/pull/4427))
  - Previously, response objects with a falsy `id` property were detected as notifications. Now, we check for the absence of the `id` property.

## [8.0.0]

### Changed

- **BREAKING:** Bump minimum Node version to 18.18 ([#3611](https://github.com/MetaMask/core/pull/3611))
- Bump `@metamask/json-rpc-engine` to `^9.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))

## [7.0.2]

### Changed

- Bump `@metamask/json-rpc-engine` to `^8.0.2` ([#4234](https://github.com/MetaMask/core/pull/4234))

## [7.0.1]

### Fixed

- Fix `types` field in `package.json` ([#4047](https://github.com/MetaMask/core/pull/4047))

## [7.0.0]

### Added

- **BREAKING**: Add ESM build ([#3998](https://github.com/MetaMask/core/pull/3998))
  - It's no longer possible to import files from `./dist` directly.

### Changed

- Bump `@metamask/json-rpc-engine` to `^8.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))

## [6.0.2]

### Changed

- Bump `@metamask/utils` to `^8.3.0` ([#3769](https://github.com/MetaMask/core/pull/3769))
- Bump `@metamask/json-rpc-engine` to `^7.3.2` ([#3821](https://github.com/MetaMask/core/pull/3821))

## [6.0.1]

### Changed

- Bump `@metamask/json-rpc-engine` to `^7.3.1` ([#3695](https://github.com/MetaMask/core/pull/3695))

## [6.0.0]

### Added

- This package was migrated from `MetaMask/json-rpc-middleware-stream` to the
  `MetaMask/core` monorepo ([#1762](https://github.com/MetaMask/core/pull/1762))
  - See [`MetaMask/json-rpc-middleware-stream`](https://github.com/MetaMask/json-rpc-middleware-stream/blob/main/CHANGELOG.md)
    for the original changelog.

## Changed

- **BREAKING**: Rename package from `json-rpc-middleware-stream` to `@metamask/json-rpc-middleware-stream` ([#1762](https://github.com/MetaMask/core/pull/1762))
- Bump `@metamask/json-rpc-engine` from `^7.1.0` to `^7.2.0` ([#1762](https://github.com/MetaMask/core/pull/1762))
- Bump `@metamask/utils` from `^8.1.0` to `^8.2.0` ([#1762](https://github.com/MetaMask/core/pull/1762))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-middleware-stream@9.0.0...HEAD
[9.0.0]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-middleware-stream@8.0.8...@metamask/json-rpc-middleware-stream@9.0.0
[8.0.8]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-middleware-stream@8.0.7...@metamask/json-rpc-middleware-stream@8.0.8
[8.0.7]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-middleware-stream@8.0.6...@metamask/json-rpc-middleware-stream@8.0.7
[8.0.6]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-middleware-stream@8.0.5...@metamask/json-rpc-middleware-stream@8.0.6
[8.0.5]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-middleware-stream@8.0.4...@metamask/json-rpc-middleware-stream@8.0.5
[8.0.4]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-middleware-stream@8.0.3...@metamask/json-rpc-middleware-stream@8.0.4
[8.0.3]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-middleware-stream@8.0.2...@metamask/json-rpc-middleware-stream@8.0.3
[8.0.2]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-middleware-stream@8.0.1...@metamask/json-rpc-middleware-stream@8.0.2
[8.0.1]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-middleware-stream@8.0.0...@metamask/json-rpc-middleware-stream@8.0.1
[8.0.0]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-middleware-stream@7.0.2...@metamask/json-rpc-middleware-stream@8.0.0
[7.0.2]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-middleware-stream@7.0.1...@metamask/json-rpc-middleware-stream@7.0.2
[7.0.1]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-middleware-stream@7.0.0...@metamask/json-rpc-middleware-stream@7.0.1
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-middleware-stream@6.0.2...@metamask/json-rpc-middleware-stream@7.0.0
[6.0.2]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-middleware-stream@6.0.1...@metamask/json-rpc-middleware-stream@6.0.2
[6.0.1]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-middleware-stream@6.0.0...@metamask/json-rpc-middleware-stream@6.0.1
[6.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/json-rpc-middleware-stream@6.0.0
