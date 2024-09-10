# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [12.0.2]

### Uncategorized

- Export phishing detector result type ([#4674](https://github.com/MetaMask/core/pull/4674))
- Add PhishingDetector to export ([#4553](https://github.com/MetaMask/core/pull/4553))
- Release 194.0.0 ([#4651](https://github.com/MetaMask/core/pull/4651))

## [12.0.1]

### Added

- Add `getHostnameFromUrl` utility function to standardize hostname extraction from URLs ([#4645](https://github.com/MetaMask/core/pull/4645))

### Fixed

- Update `test`, `isBlockedRequest`, and `bypass` methods to use the hostname for allowlist checks instead of the full origin ([#4645](https://github.com/MetaMask/core/pull/4645))
  - The previous approach of using the full origin had limitations in dealing with subdomains or variations in the URL structure, which could lead to inconsistent results or false negatives.

## [12.0.0]

### Added

- Add allowlist functionality to the C2 domain detection system ([#4464](https://github.com/MetaMask/core/pull/4644))
- Add `PhishingController` functionality for blocking client-side C2 requests by managing a hashed C2 request blocklist ([#4526](https://github.com/MetaMask/core/pull/4526))
  - Add `requestBlocklist` type to `ListTypes`.
  - Add `isBlockedRequest` method to `PhishingController`.
  - Add `isMaliciousRequestDomain` method to `PhishingDetector`.
  - Add handling of `requestBlocklist` in `PhishingDetector` configuration.
  - Add logic to update and check `requestBlocklist` when updating a stale list.
  - Add `sha256Hash` function to generate SHA-256 hash of a domain.
- Define and export new types: `PhishingControllerGetStateAction`, `PhishingControllerStateChangeEvent`, `PhishingControllerEvents` ([#4633](https://github.com/MetaMask/core/pull/4633))

### Changed

- **BREAKING:** Add `@noble/hashes` `^1.4.0` as dependency ([#4526](https://github.com/MetaMask/core/pull/4526))
- **BREAKING:**: Add `ethereum-cryptography` `^2.1.2` as dependency ([#4526](https://github.com/MetaMask/core/pull/4526))
- **BREAKING:** `PhishingControllerMessenger` must allow internal events defined in the `PhishingControllerEvents` type ([#4633](https://github.com/MetaMask/core/pull/4633))
- Widen `PhishingControllerActions` to include the `PhishingController:getState` action ([#4633](https://github.com/MetaMask/core/pull/4633))
- Bump `@metamask/base-controller` from `^6.0.2` to `^6.0.3` ([#4625](https://github.com/MetaMask/core/pull/4625))
- Bump `@metamask/controller-utils` from `^11.0.2` to `^11.1.0` ([#4639](https://github.com/MetaMask/core/pull/4639))

## [11.0.0]

### Changed

- Bump `typescript` from `~5.0.4` to `~5.2.2` ([#4584](https://github.com/MetaMask/core/pull/4584), [#4576](https://github.com/MetaMask/core/pull/4576))

### Removed

- **BREAKING:** Remove the Phishfort list from the PhishingController ([#4621](https://github.com/MetaMask/core/pull/4621))

## [10.1.1]

### Changed

- Bump TypeScript version to `~5.0.4` and set `moduleResolution` option to `Node16` ([#3645](https://github.com/MetaMask/core/pull/3645))
- Bump `@metamask/base-controller` from `^6.0.1` to `^6.0.2` ([#4544](https://github.com/MetaMask/core/pull/4544))
- Bump `@metamask/controller-utils` from `^11.0.1` to `^11.0.2` ([#4544](https://github.com/MetaMask/core/pull/4544))

## [10.1.0]

### Added

- Port `PhishingDetector` from `eth-phishing-detector`; add TypeScript types ([#4137](https://github.com/MetaMask/core/pull/4137))
- Add support for IPFS CID blocking to `PhishingDetector` ([#4465](https://github.com/MetaMask/core/pull/4465))

### Changed

- Bump `@metamask/base-controller` to `^6.0.1` ([#4517](https://github.com/MetaMask/core/pull/4517))
- Bump `@metamask/controller-utils` to `^11.0.1` ([#4517](https://github.com/MetaMask/core/pull/4517))

## [10.0.0]

### Changed

- **BREAKING:** Bump minimum Node version to 18.18 ([#3611](https://github.com/MetaMask/core/pull/3611))
- Bump `@metamask/base-controller` to `^6.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- Bump `@metamask/controller-utils` to `^11.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))

## [9.0.4]

### Changed

- Bump `@metamask/controller-utils` to `^10.0.0` ([#4342](https://github.com/MetaMask/core/pull/4342))

## [9.0.3]

### Changed

- Update phishing detection API endpoint from `*.metafi.codefi.network` to `*.api.cx.metamask.io` ([#4301](https://github.com/MetaMask/core/pull/4301))

## [9.0.2]

### Changed

- Changed Stalelist and hotlist update intervals ([#4202](https://github.com/MetaMask/core/pull/4202))
  - Updated the Stalelist update interval to 30 days and the hotlist update interval to 5 mins
- Bump `@metamask/controller-utils` version to `~9.1.0` ([#4153](https://github.com/MetaMask/core/pull/4153))
- Bump TypeScript version to `~4.9.5` ([#4084](https://github.com/MetaMask/core/pull/4084))
- Bump `@metamask/base-controller` to `^5.0.2`

## [9.0.1]

### Fixed

- Fix `types` field in `package.json` ([#4047](https://github.com/MetaMask/core/pull/4047))

## [9.0.0]

### Added

- **BREAKING**: Add ESM build ([#3998](https://github.com/MetaMask/core/pull/3998))
  - It's no longer possible to import files from `./dist` directly.

### Changed

- **BREAKING:** Bump `@metamask/base-controller` to `^5.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
  - This version has a number of breaking changes. See the changelog for more.
- Bump `@metamask/controller-utils` to `^9.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))

## [8.0.2]

### Changed

- Bump `@metamask/base-controller` to `^4.1.1` ([#3760](https://github.com/MetaMask/core/pull/3760), [#3821](https://github.com/MetaMask/core/pull/3821))
- Bump `@metamask/controller-utils` to `^8.0.2` ([#3821](https://github.com/MetaMask/core/pull/3821))

## [8.0.1]

### Changed

- Bump `@metamask/base-controller` to `^4.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695))
- Bump `@metamask/controller-utils` to `^8.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695), [#3678](https://github.com/MetaMask/core/pull/3678), [#3667](https://github.com/MetaMask/core/pull/3667), [#3580](https://github.com/MetaMask/core/pull/3580))

## [8.0.0]

### Changed

- **BREAKING:** Bump `@metamask/base-controller` to ^4.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
  - This is breaking because the type of the `messenger` has backward-incompatible changes. See the changelog for this package for more.
- Bump `@metamask/controller-utils` to ^6.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))

## [7.0.1]

### Changed

- Bump dependency on `@metamask/base-controller` to ^3.2.3 ([#1747](https://github.com/MetaMask/core/pull/1747))
- Bump dependency on `@metamask/controller-utils` to ^5.0.2 ([#1747](https://github.com/MetaMask/core/pull/1747))

## [7.0.0]

### Changed

- **BREAKING:** Migrate `PhishingController` to BaseControllerV2 ([#1705](https://github.com/MetaMask/core/pull/1705))
  - `PhishingController` now expects a `messenger` option (and corresponding type `PhishingControllerMessenger` is now available)
  - The constructor takes a single argument, an options bag, instead of three arguments
  - The `disabled` configuration is no longer supported
- Update TypeScript to v4.8.x ([#1718](https://github.com/MetaMask/core/pull/1718))

## [6.0.2]

### Changed

- Bump dependency on `@metamask/controller-utils` to ^5.0.0

## [6.0.1]

### Changed

- Bump dependency on `@metamask/base-controller` to ^3.2.1
- Bump dependency on `@metamask/controller-utils` to ^4.3.2

## [6.0.0]

### Changed

- **BREAKING:** Remove fallback phishing configuration ([#1527](https://github.com/MetaMask/core/pull/1527))
  - The default configuration is now blank. A custom initial configuration can still be specified via the constructor to preserve the old behavior.

## [5.0.0]

### Changed

- **BREAKING:** Bump to Node 16 ([#1262](https://github.com/MetaMask/core/pull/1262))

## [4.0.0]

### Changed

- **BREAKING:** Switch to new phishing configuration API that returns a diff since the last update ([#1123](https://github.com/MetaMask/core/pull/1123))
  - The "hotlist" has been replaced by a service that returns any configuration changes since the last update. This should reduce network traffic even further.
  - The endpoints used are now `https://phishing-detection.metafi.codefi.network/v1/stalelist` and `https://phishing-detection.metafi.codefi.network/v1/diffsSince/:lastUpdated`
- **BREAKING:**: The phishing controller state now keeps the MetaMask and PhishFort configuration separate, allowing for proper attribution of each block ([#1123](https://github.com/MetaMask/core/pull/1123))
  - The `listState` state property has been replaced with an array of phishing list state objects (one entry for MetaMask, one for PhishFort).
  - The PhishFort config is deduplicated server-side, so it should have zero overlap with the MetaMask configuration (which helps reduce memory/disk usage)

## [3.0.0]

### Removed

- **BREAKING:** Remove `isomorphic-fetch` ([#1106](https://github.com/MetaMask/controllers/pull/1106))
  - Consumers must now import `isomorphic-fetch` or another polyfill themselves if they are running in an environment without `fetch`

## [2.0.0]

### Changed

- **BREAKING:** Refactor to Cost-Optimized Phishing List Data Architecture. ([#1080](https://github.com/MetaMask/core/pull/1080))
  - Rather than periodically downloading two separate configurations (MetaMask and Phishfort), we now download a combined "stalelist" and "hotlist". The stalelist is downloaded every 4 days, and the hotlist is downloaded every 30 minutes. The hotlist only includes data from the last 8 days, which should dramatically reduce the required network traffic for phishing config updates.
  - When a site is blocked, we no longer know which list is responsible due to the combined format. We will need to come up with another way to attribute blocks to a specific list; this controller will no longer be responsible for that.
  - This change includes the removal of the exports:
    - `METAMASK_CONFIG_FILE` and `PHISHFORT_HOTLIST_FILE` (replaced by `METAMASK_STALELIST_FILE` and `METAMASK_HOTLIST_DIFF_FILE`)
    - `METAMASK_CONFIG_URL` and `PHISHFORT_HOTLIST_URL` (replaced by `METAMASK_STALELIST_URL` and `METAMASK_HOTLIST_DIFF_URL`)
    - `EthPhishingResponse` (replaced by `PhishingStalelist` for the API response and `PhishingListState` for the list in controller state, as they're now different)
  - The configuration has changed:
    - Instead of accepting a `refreshInterval`, we now accept a separate interval for the stalelist and hotlist (`stalelistRefreshInterval` and `hotlistRefreshInterval`)
  - The controller state has been updated:
    - The phishing list itself has been renamed from `phishing` to `listState`, and the shape has changed. Removing the old `phishing` state would be advised, as it will get replaced by an updated configuration immediately anyway.
    - `lastFetched` has been replaced by `hotlistLastFetched` and `stalelistLastFetched`. The old `lastFetched` state can be removed as well (it never needed to be persisted anyway).
  - The `setRefreshInterval` method has been replaced by `setStalelistRefreshInterval` and `setHotlistRefreshInterval`
  - The `isOutOfDate` method has been replaced by `isStalelistOutOfDate` and `isHotlistOutOfDate`
  - The `maybeUpdatePhishingLists` method has been replaced by `maybeUpdateState`
  - The `updatePhishingLists` method has been replaced by `updateStalelist` and `updateHotlist`

## [1.1.2]

### Fixed

- Improve performance of phishing list update ([#1086](https://github.com/MetaMask/core/pull/1086))
  - We now use a `Set` + `has` method instead of the array `includes` method for detecting overlap between phishing lists after an update.

## [1.1.1]

### Changed

- Rename this repository to `core` ([#1031](https://github.com/MetaMask/controllers/pull/1031))
- Update `@metamask/controller-utils` package ([#1041](https://github.com/MetaMask/controllers/pull/1041))

## [1.1.0]

### Added

- Add method to conditionally update the phishing lists ([#986](https://github.com/MetaMask/core/pull/986))

### Changed

- Relax dependencies on `@metamask/base-controller` and `@metamask/controller-utils` (use `^` instead of `~`) ([#998](https://github.com/MetaMask/core/pull/998))
- Expose `lastFetched` in PhishingController state ([#986](https://github.com/MetaMask/core/pull/986))

## [1.0.0]

### Added

- Initial release

  - As a result of converting our shared controllers repo into a monorepo ([#831](https://github.com/MetaMask/core/pull/831)), we've created this package from select parts of [`@metamask/controllers` v33.0.0](https://github.com/MetaMask/core/tree/v33.0.0), namely:

    - `src/third-party/PhishingController.ts`
    - `src/third-party/PhishingController.test.ts`

    All changes listed after this point were applied to this package following the monorepo conversion.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/phishing-controller@12.0.2...HEAD
[12.0.2]: https://github.com/MetaMask/core/compare/@metamask/phishing-controller@12.0.1...@metamask/phishing-controller@12.0.2
[12.0.1]: https://github.com/MetaMask/core/compare/@metamask/phishing-controller@12.0.0...@metamask/phishing-controller@12.0.1
[12.0.0]: https://github.com/MetaMask/core/compare/@metamask/phishing-controller@11.0.0...@metamask/phishing-controller@12.0.0
[11.0.0]: https://github.com/MetaMask/core/compare/@metamask/phishing-controller@10.1.1...@metamask/phishing-controller@11.0.0
[10.1.1]: https://github.com/MetaMask/core/compare/@metamask/phishing-controller@10.1.0...@metamask/phishing-controller@10.1.1
[10.1.0]: https://github.com/MetaMask/core/compare/@metamask/phishing-controller@10.0.0...@metamask/phishing-controller@10.1.0
[10.0.0]: https://github.com/MetaMask/core/compare/@metamask/phishing-controller@9.0.4...@metamask/phishing-controller@10.0.0
[9.0.4]: https://github.com/MetaMask/core/compare/@metamask/phishing-controller@9.0.3...@metamask/phishing-controller@9.0.4
[9.0.3]: https://github.com/MetaMask/core/compare/@metamask/phishing-controller@9.0.2...@metamask/phishing-controller@9.0.3
[9.0.2]: https://github.com/MetaMask/core/compare/@metamask/phishing-controller@9.0.1...@metamask/phishing-controller@9.0.2
[9.0.1]: https://github.com/MetaMask/core/compare/@metamask/phishing-controller@9.0.0...@metamask/phishing-controller@9.0.1
[9.0.0]: https://github.com/MetaMask/core/compare/@metamask/phishing-controller@8.0.2...@metamask/phishing-controller@9.0.0
[8.0.2]: https://github.com/MetaMask/core/compare/@metamask/phishing-controller@8.0.1...@metamask/phishing-controller@8.0.2
[8.0.1]: https://github.com/MetaMask/core/compare/@metamask/phishing-controller@8.0.0...@metamask/phishing-controller@8.0.1
[8.0.0]: https://github.com/MetaMask/core/compare/@metamask/phishing-controller@7.0.1...@metamask/phishing-controller@8.0.0
[7.0.1]: https://github.com/MetaMask/core/compare/@metamask/phishing-controller@7.0.0...@metamask/phishing-controller@7.0.1
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/phishing-controller@6.0.2...@metamask/phishing-controller@7.0.0
[6.0.2]: https://github.com/MetaMask/core/compare/@metamask/phishing-controller@6.0.1...@metamask/phishing-controller@6.0.2
[6.0.1]: https://github.com/MetaMask/core/compare/@metamask/phishing-controller@6.0.0...@metamask/phishing-controller@6.0.1
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/phishing-controller@5.0.0...@metamask/phishing-controller@6.0.0
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/phishing-controller@4.0.0...@metamask/phishing-controller@5.0.0
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/phishing-controller@3.0.0...@metamask/phishing-controller@4.0.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/phishing-controller@2.0.0...@metamask/phishing-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/phishing-controller@1.1.2...@metamask/phishing-controller@2.0.0
[1.1.2]: https://github.com/MetaMask/core/compare/@metamask/phishing-controller@1.1.1...@metamask/phishing-controller@1.1.2
[1.1.1]: https://github.com/MetaMask/core/compare/@metamask/phishing-controller@1.1.0...@metamask/phishing-controller@1.1.1
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/phishing-controller@1.0.0...@metamask/phishing-controller@1.1.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/phishing-controller@1.0.0
