# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- chore: Bump `@metamask/utils` ([#4831](https://github.com/MetaMask/core.git/pull/4831))

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

## [2.0.1]

### Fixed

- Fix `types` field in `package.json` ([#4047](https://github.com/MetaMask/core/pull/4047))

## [2.0.0]

### Added

- **BREAKING**: Add ESM build ([#3998](https://github.com/MetaMask/core/pull/3998))
  - It's no longer possible to import files from `./dist` directly.

## [1.0.2]

### Changed

- Bump `@metamask/utils` to `^8.3.0` ([#3769](https://github.com/MetaMask/core/pull/3769))

## [1.0.1]

### Fixed

- Fix broken URL in `README.md` ([#3599](https://github.com/MetaMask/core/pull/3599))

## [1.0.0]

### Added

- Initial release ([#3577](https://github.com/MetaMask/core/pull/3577) [#3588](https://github.com/MetaMask/core/pull/3588))

[Unreleased]: https://github.com/MetaMask/core.git/compare/@metamask/build-utils@3.0.1...HEAD
[3.0.1]: https://github.com/MetaMask/core.git/compare/@metamask/build-utils@3.0.0...@metamask/build-utils@3.0.1
[3.0.0]: https://github.com/MetaMask/core.git/compare/@metamask/build-utils@2.0.1...@metamask/build-utils@3.0.0
[2.0.1]: https://github.com/MetaMask/core.git/compare/@metamask/build-utils@2.0.0...@metamask/build-utils@2.0.1
[2.0.0]: https://github.com/MetaMask/core.git/compare/@metamask/build-utils@1.0.2...@metamask/build-utils@2.0.0
[1.0.2]: https://github.com/MetaMask/core.git/compare/@metamask/build-utils@1.0.1...@metamask/build-utils@1.0.2
[1.0.1]: https://github.com/MetaMask/core.git/compare/@metamask/build-utils@1.0.0...@metamask/build-utils@1.0.1
[1.0.0]: https://github.com/MetaMask/core.git/releases/tag/@metamask/build-utils@1.0.0
