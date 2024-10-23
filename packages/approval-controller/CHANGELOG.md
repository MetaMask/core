# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [7.1.0]

### Added

- Add `deleteAfterResult` option to accept method to delay removal of approval request from state ([#4715](https://github.com/MetaMask/core/pull/4715))

## [7.0.4]

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

## [7.0.3]

### Changed

- Bump `@metamask/base-controller` from `^6.0.2` to `^7.0.0` ([#4625](https://github.com/MetaMask/core/pull/4625), [#4643](https://github.com/MetaMask/core/pull/4643))
- Bump `typescript` from `~5.0.4` to `~5.2.2` ([#4576](https://github.com/MetaMask/core/pull/4576), [#4584](https://github.com/MetaMask/core/pull/4584))

## [7.0.2]

### Changed

- Bump TypeScript version to `~5.0.4` and set `moduleResolution` option to `Node16` ([#3645](https://github.com/MetaMask/core/pull/3645))
- Bump `@metamask/base-controller` from `^6.0.1` from `^6.0.2` ([#4544](https://github.com/MetaMask/core/pull/4544))
- Bump `@metamask/utils` from `^9.0.0` to `^9.1.0` ([#4529](https://github.com/MetaMask/core/pull/4529))

## [7.0.1]

### Changed

- Bump `@metamask/rpc-errors` from `6.2.1` to `^6.3.1` ([#4516](https://github.com/MetaMask/core/pull/4516))
- Bump `@metamask/utils` from `^8.3.0` to `^9.0.0` ([#4516](https://github.com/MetaMask/core/pull/4516))
- Bump `@metamask/base-controller` to `^6.0.1` ([#4517](https://github.com/MetaMask/core/pull/4517))

## [7.0.0]

### Changed

- **BREAKING:** Bump minimum Node version to 18.18 ([#3611](https://github.com/MetaMask/core/pull/3611))
- Bump `@metamask/base-controller` to `^6.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))

## [6.0.2]

### Changed

- Bump TypeScript version to `~4.9.5` ([#4084](https://github.com/MetaMask/core/pull/4084))
- Bump `@metamask/base-controller` to `^5.0.2` ([#4232](https://github.com/MetaMask/core/pull/4232))

## [6.0.1]

### Fixed

- Fix `types` field in `package.json` ([#4047](https://github.com/MetaMask/core/pull/4047))

## [6.0.0]

### Added

- **BREAKING**: Add ESM build ([#3998](https://github.com/MetaMask/core/pull/3998))
  - It's no longer possible to import files from `./dist` directly.

### Changed

- **BREAKING:** Bump `@metamask/base-controller` to `^5.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
  - This version has a number of breaking changes. See the changelog for more.

### Fixed

- **BREAKING:** Narrow `ApprovalControllerMessenger` type parameters `AllowedAction` and `AllowedEvent` from `string` to `never` ([#4031](https://github.com/MetaMask/core/pull/4031))
  - Allowlisting or using any external actions or events will now produce a type error.

## [5.1.3]

### Changed

- Bump `@metamask/rpc-errors` to `^6.2.1` ([#3954](https://github.com/MetaMask/core/pull/3954))

## [5.1.2]

### Changed

- Bump `@metamask/utils` to `^8.3.0` ([#3769](https://github.com/MetaMask/core/pull/3769))
- Bump `@metamask/base-controller` to `^4.1.1` ([#3760](https://github.com/MetaMask/core/pull/3760), [#3821](https://github.com/MetaMask/core/pull/3821))

## [5.1.1]

### Changed

- Bump `@metamask/base-controller` to `^4.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695))

## [5.1.0]

### Added

- Add `title` and `icon` options to `success` and `error` methods ([#3675](https://github.com/MetaMask/core/pull/3675))

## [5.0.0]

### Changed

- **BREAKING:** Bump `@metamask/base-controller` to ^4.0.0 (TODO: THIS PR)
  - This is breaking because the type of the `messenger` has backward-incompatible changes. See the changelog for this package for more.
- Bump `@metamask/utils` to ^8.2.0 ([#1957](https://github.com/MetaMask/core/pull/1957))

## [4.1.0]

### Added

- Add `show` option for `startFlow` ([#1886](https://github.com/MetaMask/core/pull/1886))
  - This option lets you initiate a new approval flow without triggering the UI immediately.

## [4.0.1]

### Changed

- Bump dependency on `@metamask/rpc-errors` to ^6.1.0 ([#1653](https://github.com/MetaMask/core/pull/1653))

## [4.0.0]

### Changed

- **BREAKING:** Move `eth-rpc-errors@^4.0.2` dependency to `@metamask/rpc-errors@^6.0.2` ([#1743](https://github.com/MetaMask/core/pull/1743))
  - Upon upgrading, you may need to also use `@metamask/rpc-errors@^6.0.2`, which restricts valid data that can be used to build messages
- Bump dependency on `@metamask/utils` to ^8.1.0 ([#1639](https://github.com/MetaMask/core/pull/1639))
- Bump dependency on `@metamask/base-controller` to ^3.2.3

## [3.5.2]

### Changed

- Update TypeScript to v4.8.x ([#1718](https://github.com/MetaMask/core/pull/1718))

## [3.5.1]

### Changed

- Bump dependency on `@metamask/base-controller` to ^3.2.1

## [3.5.0]

### Changed

- Update `@metamask/utils` to `^6.2.0` ([#1514](https://github.com/MetaMask/core/pull/1514))

## [3.4.0]

### Added

- Add `success` and `error` methods to display result pages ([#1442](https://github.com/MetaMask/core/pull/1442))

## [3.3.0]

### Added

- Add `setFlowLoadingText` method to ApprovalController ([#1419](https://github.com/MetaMask/core/pull/1419))

## [3.2.0]

### Added

- Add `startFlow` and `endFlow` methods to ApprovalController ([#1394](https://github.com/MetaMask/core/pull/1394))

### Fixed

- Fix ApprovalController constructor so that it accepts a messenger created by calling `getRestricted` without having type parameters explicitly specified ([#1417](https://github.com/MetaMask/core/pull/1417))

## [3.1.0]

### Added

- Optional feedback when accepting an approval request ([#1396](https://github.com/MetaMask/core/pull/1396))

## [3.0.0]

### Changed

- **BREAKING:** Bump to Node 16 ([#1262](https://github.com/MetaMask/core/pull/1262))
- Replace `@metamask/controller-utils` dependency with `@metamask/utils` ([#1370](https://github.com/MetaMask/core/pull/1370))

## [2.1.1]

### Changed

- deps: eth-rpc-errors@4.0.0->4.0.2 ([#1215](https://github.com/MetaMask/core/pull/1215))

## [2.1.0]

### Added

- Option to exclude types from rate limiting ([#1185](https://github.com/MetaMask/core/pull/1185))

## [2.0.0]

### Removed

- **BREAKING:** Remove `isomorphic-fetch` ([#1106](https://github.com/MetaMask/controllers/pull/1106))
  - Consumers must now import `isomorphic-fetch` or another polyfill themselves if they are running in an environment without `fetch`

## [1.1.0]

### Added

- Add `updateRequestState` action to `ApprovalController` ([#1059](https://github.com/MetaMask/controllers/pull/1059))

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

    - Everything in `src/approval`

    All changes listed after this point were applied to this package following the monorepo conversion.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/approval-controller@7.1.0...HEAD
[7.1.0]: https://github.com/MetaMask/core/compare/@metamask/approval-controller@7.0.4...@metamask/approval-controller@7.1.0
[7.0.4]: https://github.com/MetaMask/core/compare/@metamask/approval-controller@7.0.3...@metamask/approval-controller@7.0.4
[7.0.3]: https://github.com/MetaMask/core/compare/@metamask/approval-controller@7.0.2...@metamask/approval-controller@7.0.3
[7.0.2]: https://github.com/MetaMask/core/compare/@metamask/approval-controller@7.0.1...@metamask/approval-controller@7.0.2
[7.0.1]: https://github.com/MetaMask/core/compare/@metamask/approval-controller@7.0.0...@metamask/approval-controller@7.0.1
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/approval-controller@6.0.2...@metamask/approval-controller@7.0.0
[6.0.2]: https://github.com/MetaMask/core/compare/@metamask/approval-controller@6.0.1...@metamask/approval-controller@6.0.2
[6.0.1]: https://github.com/MetaMask/core/compare/@metamask/approval-controller@6.0.0...@metamask/approval-controller@6.0.1
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/approval-controller@5.1.3...@metamask/approval-controller@6.0.0
[5.1.3]: https://github.com/MetaMask/core/compare/@metamask/approval-controller@5.1.2...@metamask/approval-controller@5.1.3
[5.1.2]: https://github.com/MetaMask/core/compare/@metamask/approval-controller@5.1.1...@metamask/approval-controller@5.1.2
[5.1.1]: https://github.com/MetaMask/core/compare/@metamask/approval-controller@5.1.0...@metamask/approval-controller@5.1.1
[5.1.0]: https://github.com/MetaMask/core/compare/@metamask/approval-controller@5.0.0...@metamask/approval-controller@5.1.0
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/approval-controller@4.1.0...@metamask/approval-controller@5.0.0
[4.1.0]: https://github.com/MetaMask/core/compare/@metamask/approval-controller@4.0.1...@metamask/approval-controller@4.1.0
[4.0.1]: https://github.com/MetaMask/core/compare/@metamask/approval-controller@4.0.0...@metamask/approval-controller@4.0.1
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/approval-controller@3.5.2...@metamask/approval-controller@4.0.0
[3.5.2]: https://github.com/MetaMask/core/compare/@metamask/approval-controller@3.5.1...@metamask/approval-controller@3.5.2
[3.5.1]: https://github.com/MetaMask/core/compare/@metamask/approval-controller@3.5.0...@metamask/approval-controller@3.5.1
[3.5.0]: https://github.com/MetaMask/core/compare/@metamask/approval-controller@3.4.0...@metamask/approval-controller@3.5.0
[3.4.0]: https://github.com/MetaMask/core/compare/@metamask/approval-controller@3.3.0...@metamask/approval-controller@3.4.0
[3.3.0]: https://github.com/MetaMask/core/compare/@metamask/approval-controller@3.2.0...@metamask/approval-controller@3.3.0
[3.2.0]: https://github.com/MetaMask/core/compare/@metamask/approval-controller@3.1.0...@metamask/approval-controller@3.2.0
[3.1.0]: https://github.com/MetaMask/core/compare/@metamask/approval-controller@3.0.0...@metamask/approval-controller@3.1.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/approval-controller@2.1.1...@metamask/approval-controller@3.0.0
[2.1.1]: https://github.com/MetaMask/core/compare/@metamask/approval-controller@2.1.0...@metamask/approval-controller@2.1.1
[2.1.0]: https://github.com/MetaMask/core/compare/@metamask/approval-controller@2.0.0...@metamask/approval-controller@2.1.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/approval-controller@1.1.0...@metamask/approval-controller@2.0.0
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/approval-controller@1.0.1...@metamask/approval-controller@1.1.0
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/approval-controller@1.0.0...@metamask/approval-controller@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/approval-controller@1.0.0
