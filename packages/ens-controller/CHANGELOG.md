# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [17.0.1]

### Changed

- Bump `@metamask/controller-utils` from `^11.10.0` to `^11.11.0` ([#6069](https://github.com/MetaMask/core/pull/6069))
  - This upgrade includes performance improvements to checksum hex address normalization
- Bump `@metamask/utils` from `^11.2.0` to `^11.4.2` ([#6054](https://github.com/MetaMask/core/pull/6054))

## [17.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/network-controller` to `^24.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))
- Bump `@metamask/base-controller` to `^8.0.1` ([#5722](https://github.com/MetaMask/core/pull/5722))
- Bump `@metamask/controller-utils` to `^11.10.0` ([#5935](https://github.com/MetaMask/core/pull/5935), [#5583](https://github.com/MetaMask/core/pull/5583), [#5765](https://github.com/MetaMask/core/pull/5765), [#5812](https://github.com/MetaMask/core/pull/5812))

## [16.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/network-controller` to `^23.0.0` ([#5507](https://github.com/MetaMask/core/pull/5507))
- Bump `@metamask/controller-utils` to `^11.6.0` ([#5439](https://github.com/MetaMask/core/pull/5439))
- Bump `@metamask/utils` to `^11.2.0` ([#5301](https://github.com/MetaMask/core/pull/5301))

## [15.0.2]

### Changed

- Bump `@metamask/base-controller` from `^7.0.2` to `^8.0.0` ([#5079](https://github.com/MetaMask/core/pull/5079)), ([#5135](https://github.com/MetaMask/core/pull/5135)), ([#5305](https://github.com/MetaMask/core/pull/5305))
- Bump `@metamask/controller-utils` from `^11.4.4` to `^11.5.0` ([#5135](https://github.com/MetaMask/core/pull/5135)), ([#5272](https://github.com/MetaMask/core/pull/5272))
- Bump `@metamask/utils` from `^10.0.0` to `^11.1.0` ([#5080](https://github.com/MetaMask/core/pull/5080)), ([#5223](https://github.com/MetaMask/core/pull/5223))

## [15.0.1]

### Changed

- Bump `@metamask/base-controller` from `^7.0.1` to `^7.0.2` ([#4862](https://github.com/MetaMask/core/pull/4862))
- Bump `@metamask/controller-utils` from `^11.4.0` to `^11.4.4` ([#4862](https://github.com/MetaMask/core/pull/4862), [#4870](https://github.com/MetaMask/core/pull/4870), [#4915](https://github.com/MetaMask/core/pull/4915), [#5012](https://github.com/MetaMask/core/pull/5012))

### Fixed

- Correct ESM-compatible build so that imports of the following packages that re-export other modules via `export *` are no longer corrupted: ([#5011](https://github.com/MetaMask/core/pull/5011))
  - `punycode/punycode.js`

## [15.0.0]

### Changed

- **BREAKING:** Bump `@metamask/network-controller` peer dependency to `^22.0.0` ([#4841](https://github.com/MetaMask/core/pull/4841))
- Bump `@metamask/controller-utils` to `^11.4.0` ([#4834](https://github.com/MetaMask/core/pull/4834))
- Bump `@metamask/utils` to `^10.0.0` ([#4831](https://github.com/MetaMask/core/pull/4831))

## [14.0.1]

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

## [14.0.0]

### Changed

- **BREAKING:** `EnsControllerMessenger` must allow `NetworkController:getState` action ([#4557](https://github.com/MetaMask/core/pull/4557))
- **BREAKING:** Bump devDependency and peerDependency `@metamask/network-controller` from `^20.0.0` to `^21.0.0` ([#4618](https://github.com/MetaMask/core/pull/4618), [#4651](https://github.com/MetaMask/core/pull/4651))
- Bump `@metamask/base-controller` from `^6.0.2` to `^7.0.0` ([#4625](https://github.com/MetaMask/core/pull/4625), [#4643](https://github.com/MetaMask/core/pull/4643))
- Bump `@metamask/controller-utils` from `^11.0.2` to `^11.2.0` ([#4639](https://github.com/MetaMask/core/pull/4639), [#4651](https://github.com/MetaMask/core/pull/4651))
- Bump `typescript` from `~5.0.4` to `~5.2.2` ([#4576](https://github.com/MetaMask/core/pull/4576), [#4584](https://github.com/MetaMask/core/pull/4584))

### Removed

- **BREAKING:** Remove optional constructor option `provider` ([#4557](https://github.com/MetaMask/core/pull/4557))
  - Provider is now sourced from `selectedNetworkClient`.

### Fixed

- Initial network is set using `selectedNetworkClientId`, which is derived using the `NetworkController:getState` action ([#4557](https://github.com/MetaMask/core/pull/4557))

## [13.0.1]

### Changed

- Upgrade TypeScript version to `~5.0.4` and set `moduleResolution` option to `Node16` ([#3645](https://github.com/MetaMask/core/pull/3645))
- Bump `@metamask/base-controller` from `^6.0.0` to `^6.0.2` ([#4517](https://github.com/MetaMask/core/pull/4517), [#4544](https://github.com/MetaMask/core/pull/4544))
- Bump `@metamask/controller-utils` from `^11.0.0` to `^11.0.2` ([#4517](https://github.com/MetaMask/core/pull/4517), [#4544](https://github.com/MetaMask/core/pull/4544))
- Bump `@metamask/utils` from `^8.3.0` to `^9.1.0` ([#4516](https://github.com/MetaMask/core/pull/4516), [#4529](https://github.com/MetaMask/core/pull/4529))

## [13.0.0]

### Changed

- **BREAKING:** Bump peerDependency `@metamask/network-controller` to `^20.0.0` ([#4508](https://github.com/MetaMask/core/pull/4508))

## [12.0.0]

### Changed

- **BREAKING:** Bump minimum Node version to 18.18 ([#3611](https://github.com/MetaMask/core/pull/3611))
- **BREAKING:** Bump peer dependency `@metamask/network-controller` to `^19.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- Bump `@metamask/base-controller` to `^6.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- Bump `@metamask/controller-utils` to `^11.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))

## [11.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/network-controller` to `^18.1.3` ([#4342](https://github.com/MetaMask/core/pull/4342))
- Bump `@metamask/base-controller` to `^5.0.2` ([#4232](https://github.com/MetaMask/core/pull/4232))
- Bump `@metamask/controller-utils` to `^10.0.0` ([#4342](https://github.com/MetaMask/core/pull/4342))

### Fixed

- Fix `delete` method to protect against prototype-polluting assignments ([#4041](https://github.com/MetaMask/core/pull/4041)

## [10.0.1]

### Fixed

- Fix `types` field in `package.json` ([#4047](https://github.com/MetaMask/core/pull/4047))

## [10.0.0]

### Added

- **BREAKING**: Add ESM build ([#3998](https://github.com/MetaMask/core/pull/3998))
  - It's no longer possible to import files from `./dist` directly.
- Add support for Holesky and Sepolia registries ([#4006](https://github.com/MetaMask/core/pull/4006))
- Add optional constructor option `registriesByChainId`, which allows overriding the default ENS network map ([#4006](https://github.com/MetaMask/core/pull/4006))
- Update default value of `ensEntries` state property to include entry for `.` ([#4006](https://github.com/MetaMask/core/pull/4006))
- Update `get` so that it now returns registry address for chain when queried for the name `.` ([#4006](https://github.com/MetaMask/core/pull/4006))
- Update `delete` so that entry for `.` can be removed ([#4006](https://github.com/MetaMask/core/pull/4006))

### Changed

- **BREAKING:** Bump `@metamask/base-controller` to `^5.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
  - This version has a number of breaking changes. See the changelog for more.
- **BREAKING:** Bump peer dependency on `@metamask/network-controller` to `^18.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
- Bump `@metamask/controller-utils` to `^9.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))

## [9.0.0]

### Changed

- **BREAKING:** Bump `@metamask/network-controller` peer dependency to `^17.2.0` ([#3821](https://github.com/MetaMask/core/pull/3821))
- Bump `@metamask/utils` to `^8.3.0` ([#3769](https://github.com/MetaMask/core/pull/3769))
- Bump `@metamask/base-controller` to `^4.1.1` ([#3760](https://github.com/MetaMask/core/pull/3760), [#3821](https://github.com/MetaMask/core/pull/3821))
- Bump `@metamask/controller-utils` to `^8.0.2` ([#3821](https://github.com/MetaMask/core/pull/3821))

## [8.0.0]

### Changed

- **BREAKING:** Replace constructor parameter `onNetworkStateChange` with `onNetworkDidChange` ([#3610](https://github.com/MetaMask/core/pull/3610))
- **BREAKING:** Bump `@metamask/network-controller` peer dependency from `^17.0.0` to `^17.1.0` ([#3695](https://github.com/MetaMask/core/pull/3695))
- Bump `@metamask/controller-utils` to `^8.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695), [#3678](https://github.com/MetaMask/core/pull/3678), [#3667](https://github.com/MetaMask/core/pull/3667), [#3580](https://github.com/MetaMask/core/pull/3580))
- Bump `@metamask/base-controller` to `^4.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695))

### Fixed

- Remove `@metamask/network-controller` dependency ([#3607](https://github.com/MetaMask/core/pull/3607))

## [7.0.0]

### Changed

- **BREAKING:** Bump `@metamask/base-controller` to ^4.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
  - This is breaking because the type of the `messenger` has backward-incompatible changes. See the changelog for this package for more.
- Bump `@metamask/controller-utils` to ^6.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
- Bump `@metamask/network-controller` to ^17.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))

## [6.0.1]

### Changed

- **BREAKING:** Bump dependency and peer dependency on `@metamask/network-controller` to ^16.0.0
- Bump @metamask/utils from 8.1.0 to 8.2.0 ([#1957](https://github.com/MetaMask/core/pull/1957))

## [6.0.0]

### Changed

- **BREAKING:** Bump dependency and peer dependency on `@metamask/network-controller` to ^15.0.0

## [5.0.2]

### Changed

- Bump dependency on `@metamask/utils` to ^8.1.0 ([#1639](https://github.com/MetaMask/core/pull/1639))
- Bump dependency on `@metamask/base-controller` to ^3.2.3
- Bump dependency on `@metamask/controller-utils` to ^5.0.2
- Bump dependency and peer dependency on `@metamask/network-controller` to ^14.0.0

## [5.0.1]

### Changed

- Update TypeScript to v4.8.x ([#1718](https://github.com/MetaMask/core/pull/1718))

## [5.0.0]

### Changed

- **BREAKING**: Bump peer dependency on `@metamask/network-controller` to ^13.0.0 ([#1633](https://github.com/MetaMask/core/pull/1633))
- Use `providerConfig.chainId` instead of `providerConfig.networkId` to determine ENS compatability ([#1633](https://github.com/MetaMask/core/pull/1633))
- Bump dependency on `@metamask/controller-utils` to ^5.0.0 ([#1633](https://github.com/MetaMask/core/pull/1633))

## [4.1.1]

### Changed

- Bump dependency on `@metamask/base-controller` to ^3.2.1
- Bump dependency on `@metamask/controller-utils` to ^4.3.2
- Bump dependency and peer dependency on `@metamask/network-controller` to ^12.1.2

## [4.1.0]

### Changed

- Update `@metamask/utils` to `^6.2.0` ([#1514](https://github.com/MetaMask/core/pull/1514))

## [4.0.0]

### Changed

- **BREAKING:** Bump to Node 16 ([#1262](https://github.com/MetaMask/core/pull/1262))
- **BREAKING:** Add `@metamask/network-controller` as a dependency and peer dependency ([#1367](https://github.com/MetaMask/core/pull/1367), [#1362](https://github.com/MetaMask/core/pull/1362))
- **BREAKING:** The `ensEntries` state property is now keyed by `Hex` chain ID rather than `string`, and the `chainId` property of each ENS entry is also `Hex` rather than `string`. ([#1367](https://github.com/MetaMask/core/pull/1367))
  - This requires a state migration
- **BREAKING:** The methods `get`, `set`, and `delete` have been updated to accept and return chain IDs as 0x-prefixed hex strings, rather than decimal strings. ([#1367](https://github.com/MetaMask/core/pull/1367))
- Bump @metamask/utils from 5.0.1 to 5.0.2 ([#1271](https://github.com/MetaMask/core/pull/1271))

### Fixed

- Fix ENS controller failure to initialize after switching networks ([#1362](https://github.com/MetaMask/core/pull/1362))

## [3.1.0]

### Changed

- Add support for reverse ENS address resolution ([#1170](https://github.com/MetaMask/core/pull/1170))
  - This controller can now resolve a network address to an ENS address. This feature was ported from the extension ENS controller.

## [3.0.0]

### Changed

- **BREAKING:** Convert the ENS controller to the BaseController v2 API ([#1134](https://github.com/MetaMask/core/pull/1134))

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

    - `src/third-party/EnsController.ts`
    - `src/third-party/EnsController.test.ts`

    All changes listed after this point were applied to this package following the monorepo conversion.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@17.0.1...HEAD
[17.0.1]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@17.0.0...@metamask/ens-controller@17.0.1
[17.0.0]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@16.0.0...@metamask/ens-controller@17.0.0
[16.0.0]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@15.0.2...@metamask/ens-controller@16.0.0
[15.0.2]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@15.0.1...@metamask/ens-controller@15.0.2
[15.0.1]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@15.0.0...@metamask/ens-controller@15.0.1
[15.0.0]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@14.0.1...@metamask/ens-controller@15.0.0
[14.0.1]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@14.0.0...@metamask/ens-controller@14.0.1
[14.0.0]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@13.0.1...@metamask/ens-controller@14.0.0
[13.0.1]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@13.0.0...@metamask/ens-controller@13.0.1
[13.0.0]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@12.0.0...@metamask/ens-controller@13.0.0
[12.0.0]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@11.0.0...@metamask/ens-controller@12.0.0
[11.0.0]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@10.0.1...@metamask/ens-controller@11.0.0
[10.0.1]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@10.0.0...@metamask/ens-controller@10.0.1
[10.0.0]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@9.0.0...@metamask/ens-controller@10.0.0
[9.0.0]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@8.0.0...@metamask/ens-controller@9.0.0
[8.0.0]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@7.0.0...@metamask/ens-controller@8.0.0
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@6.0.1...@metamask/ens-controller@7.0.0
[6.0.1]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@6.0.0...@metamask/ens-controller@6.0.1
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@5.0.2...@metamask/ens-controller@6.0.0
[5.0.2]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@5.0.1...@metamask/ens-controller@5.0.2
[5.0.1]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@5.0.0...@metamask/ens-controller@5.0.1
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@4.1.1...@metamask/ens-controller@5.0.0
[4.1.1]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@4.1.0...@metamask/ens-controller@4.1.1
[4.1.0]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@4.0.0...@metamask/ens-controller@4.1.0
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@3.1.0...@metamask/ens-controller@4.0.0
[3.1.0]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@3.0.0...@metamask/ens-controller@3.1.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@2.0.0...@metamask/ens-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@1.0.2...@metamask/ens-controller@2.0.0
[1.0.2]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@1.0.1...@metamask/ens-controller@1.0.2
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/ens-controller@1.0.0...@metamask/ens-controller@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/ens-controller@1.0.0
