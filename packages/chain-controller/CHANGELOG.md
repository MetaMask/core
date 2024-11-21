# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0]

### Changed

- **BREAKING:** Bump `@metamask/keyring-api` from `^8.1.3` to `^10.1.0` ([#4948](https://github.com/MetaMask/core/pull/4948))
  - Bump the peer dependency `@metamask/providers` from `^17.2.0` to `^18.1.0`.
- Bump `@metamask/keyring-api` from `^8.1.3` to `^10.1.0` ([#4948](https://github.com/MetaMask/core/pull/4948))
- Bump `@metamask/snaps-utils` from `^4.3.6` to `^8.3.0` ([#4948](https://github.com/MetaMask/core/pull/4948))
- Bump `@metamask/snaps-sdk` from `^6.5.0` to `^6.7.0` ([#4948](https://github.com/MetaMask/core/pull/4948))
- Bump `@metamask/snaps-controllers` from `^9.7.0`to `^9.10.0` ([#4948](https://github.com/MetaMask/core/pull/4948))
- Bump `@metamask/utils` from `^9.1.0` to `^10.0.0` ([#4831](https://github.com/MetaMask/core/pull/4831))

## [0.1.3]

### Changed

- Bump accounts related packages ([#4713](https://github.com/MetaMask/core/pull/4713)), ([#4728](https://github.com/MetaMask/core/pull/4728))
  - Those packages are now built slightly differently and are part of the [accounts monorepo](https://github.com/MetaMask/accounts).
  - Bump `@metamask/keyring-api` from `^8.1.0` to `^8.1.4`

## [0.1.2]

### Changed

- Bump `@metamask/keyring-api` from `^8.0.1` to `^8.1.0` ([#4594](https://github.com/MetaMask/core/pull/4594))
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

## [0.1.1]

### Changed

- Upgrade TypeScript version to `~5.0.4` and set `moduleResolution` option to `Node16` ([#3645](https://github.com/MetaMask/core/pull/3645))
- Bump `@metamask/base-controller` from `^6.0.0` to `^6.0.2` ([#4517](https://github.com/MetaMask/core/pull/4517), [#4544](https://github.com/MetaMask/core/pull/4544))
- Bump `@metamask/chain-api` from `^0.0.1` to `^0.1.0` ([#3645](https://github.com/MetaMask/core/pull/3645))
- Bump `@metamask/keyring-api` from `^8.0.0` to `^8.0.1` ([#3645](https://github.com/MetaMask/core/pull/3645))
- Bump `@metamask/snaps-controllers` from `^8.1.1` to `^9.3.1` ([#3645](https://github.com/MetaMask/core/pull/3645), [#4547](https://github.com/MetaMask/core/pull/4547))
- Bump `@metamask/snaps-sdk` from `^4.2.0` to `^6.1.1` ([#3645](https://github.com/MetaMask/core/pull/3645), [#4547](https://github.com/MetaMask/core/pull/4547))
- Bump `@metamask/snaps-utils` from `^7.4.0` to `^7.8.1` ([#3645](https://github.com/MetaMask/core/pull/3645), [#4547](https://github.com/MetaMask/core/pull/4547))
- Bump `@metamask/utils` from `^8.3.0` to `^9.1.0` ([#4516](https://github.com/MetaMask/core/pull/4516), [#4529](https://github.com/MetaMask/core/pull/4529))

## [0.1.0]

### Changed

- Initial release

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/chain-controller@0.2.0...HEAD
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/chain-controller@0.1.3...@metamask/chain-controller@0.2.0
[0.1.3]: https://github.com/MetaMask/core/compare/@metamask/chain-controller@0.1.2...@metamask/chain-controller@0.1.3
[0.1.2]: https://github.com/MetaMask/core/compare/@metamask/chain-controller@0.1.1...@metamask/chain-controller@0.1.2
[0.1.1]: https://github.com/MetaMask/core/compare/@metamask/chain-controller@0.1.0...@metamask/chain-controller@0.1.1
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/chain-controller@0.1.0
