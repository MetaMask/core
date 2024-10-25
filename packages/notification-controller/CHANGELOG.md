# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- chore: Bump `@metamask/utils` ([#4831](https://github.com/MetaMask/core.git/pull/4831))

## [7.0.0]

### Changed

- **BREAKING**: The `show` function now uses an option bag rather than a single `string` ([#4682](https://github.com/MetaMask/core/pull/4682))
  - This will be used to persist the extra properties needed to show JSX content in Snap notifications.

## [6.0.1]

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

## [6.0.0]

### Changed

- **BREAKING:** Bump minimum Node version to 18.18 ([#3611](https://github.com/MetaMask/core/pull/3611))
- Bump `@metamask/base-controller` to `^6.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))

## [5.0.2]

### Changed

- Bump `@metamask/base-controller` to `^5.0.2` ([#4232](https://github.com/MetaMask/core/pull/4232))

## [5.0.1]

### Fixed

- Fix `types` field in `package.json` ([#4047](https://github.com/MetaMask/core/pull/4047))

## [5.0.0]

### Added

- **BREAKING**: Add ESM build ([#3998](https://github.com/MetaMask/core/pull/3998))
  - It's no longer possible to import files from `./dist` directly.

### Changed

- **BREAKING:** Bump `@metamask/base-controller` to `^5.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
  - This version has a number of breaking changes. See the changelog for more.

## [4.0.2]

### Changed

- Bump `@metamask/utils` to `^8.3.0` ([#3769](https://github.com/MetaMask/core/pull/3769))
- Bump `@metamask/base-controller` to `^4.1.1` ([#3760](https://github.com/MetaMask/core/pull/3760), [#3821](https://github.com/MetaMask/core/pull/3821))

## [4.0.1]

### Changed

- Bump `@metamask/base-controller` to `^4.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695))

## [4.0.0]

### Changed

- **BREAKING:** Bump `@metamask/base-controller` to ^4.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
  - This is breaking because the type of the `messenger` has backward-incompatible changes. See the changelog for this package for more.
- Bump `@metamask/utils` to ^8.2.0 ([#1957](https://github.com/MetaMask/core/pull/1957))

## [3.1.3]

### Changed

- Bump dependency on `@metamask/utils` to ^8.1.0 ([#1639](https://github.com/MetaMask/core/pull/1639))
- Bump dependency on `@metamask/base-controller` to ^3.2.3

## [3.1.2]

### Changed

- Update TypeScript to v4.8.x ([#1718](https://github.com/MetaMask/core/pull/1718))

## [3.1.1]

### Changed

- Bump dependency on `@metamask/base-controller` to ^3.2.1

## [3.1.0]

### Changed

- Update `@metamask/utils` to `^6.2.0` ([#1514](https://github.com/MetaMask/core/pull/1514))

## [3.0.0]

### Changed

- **BREAKING:** Bump to Node 16 ([#1262](https://github.com/MetaMask/core/pull/1262))
- Add `@metamask/utils` dependency ([#1275](https://github.com/MetaMask/core/pull/1275))

## [2.0.0]

### Removed

- **BREAKING:** Remove `isomorphic-fetch` ([#1106](https://github.com/MetaMask/controllers/pull/1106))
  - Consumers must now import `isomorphic-fetch` or another polyfill themselves if they are running in an environment without `fetch`

## [1.0.2]

### Changed

- Rename this repository to `core` ([#1031](https://github.com/MetaMask/controllers/pull/1031))
- Update `@metamask/controller-utils` package ([#1041](https://github.com/MetaMask/controllers/pull/1041))

## [1.0.1]

### Changed

- Relax dependencies on `@metamask/base-controller` and `@metamask/controller-utils` (use `^` instead of `~`) ([#998](https://github.com/MetaMask/core/pull/998))

## [1.0.0]

### Added

- Initial release

  - As a result of converting our shared controllers repo into a monorepo ([#831](https://github.com/MetaMask/core/pull/831)), we've created this package from select parts of [`@metamask/controllers` v33.0.0](https://github.com/MetaMask/core/tree/v33.0.0), namely:

    - Everything in `src/notification`

    All changes listed after this point were applied to this package following the monorepo conversion.

[Unreleased]: https://github.com/MetaMask/core.git/compare/@metamask/notification-controller@7.0.0...HEAD
[7.0.0]: https://github.com/MetaMask/core.git/compare/@metamask/notification-controller@6.0.1...@metamask/notification-controller@7.0.0
[6.0.1]: https://github.com/MetaMask/core.git/compare/@metamask/notification-controller@6.0.0...@metamask/notification-controller@6.0.1
[6.0.0]: https://github.com/MetaMask/core.git/compare/@metamask/notification-controller@5.0.2...@metamask/notification-controller@6.0.0
[5.0.2]: https://github.com/MetaMask/core.git/compare/@metamask/notification-controller@5.0.1...@metamask/notification-controller@5.0.2
[5.0.1]: https://github.com/MetaMask/core.git/compare/@metamask/notification-controller@5.0.0...@metamask/notification-controller@5.0.1
[5.0.0]: https://github.com/MetaMask/core.git/compare/@metamask/notification-controller@4.0.2...@metamask/notification-controller@5.0.0
[4.0.2]: https://github.com/MetaMask/core.git/compare/@metamask/notification-controller@4.0.1...@metamask/notification-controller@4.0.2
[4.0.1]: https://github.com/MetaMask/core.git/compare/@metamask/notification-controller@4.0.0...@metamask/notification-controller@4.0.1
[4.0.0]: https://github.com/MetaMask/core.git/compare/@metamask/notification-controller@3.1.3...@metamask/notification-controller@4.0.0
[3.1.3]: https://github.com/MetaMask/core.git/compare/@metamask/notification-controller@3.1.2...@metamask/notification-controller@3.1.3
[3.1.2]: https://github.com/MetaMask/core.git/compare/@metamask/notification-controller@3.1.1...@metamask/notification-controller@3.1.2
[3.1.1]: https://github.com/MetaMask/core.git/compare/@metamask/notification-controller@3.1.0...@metamask/notification-controller@3.1.1
[3.1.0]: https://github.com/MetaMask/core.git/compare/@metamask/notification-controller@3.0.0...@metamask/notification-controller@3.1.0
[3.0.0]: https://github.com/MetaMask/core.git/compare/@metamask/notification-controller@2.0.0...@metamask/notification-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core.git/compare/@metamask/notification-controller@1.0.2...@metamask/notification-controller@2.0.0
[1.0.2]: https://github.com/MetaMask/core.git/compare/@metamask/notification-controller@1.0.1...@metamask/notification-controller@1.0.2
[1.0.1]: https://github.com/MetaMask/core.git/compare/@metamask/notification-controller@1.0.0...@metamask/notification-controller@1.0.1
[1.0.0]: https://github.com/MetaMask/core.git/releases/tag/@metamask/notification-controller@1.0.0
