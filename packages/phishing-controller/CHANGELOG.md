# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.0.0]
### Removed
- BREAKING: Remove `isomorphic-fetch` ([#1106](https://github.com/MetaMask/controllers/pull/1106))

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

[Unreleased]: https://github.com/MetaMask/controllers/compare/@metamask/phishing-controller@3.0.0...HEAD
[3.0.0]: https://github.com/MetaMask/controllers/compare/@metamask/phishing-controller@2.0.0...@metamask/phishing-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/controllers/compare/@metamask/phishing-controller@1.1.2...@metamask/phishing-controller@2.0.0
[1.1.2]: https://github.com/MetaMask/controllers/compare/@metamask/phishing-controller@1.1.1...@metamask/phishing-controller@1.1.2
[1.1.1]: https://github.com/MetaMask/controllers/compare/@metamask/phishing-controller@1.1.0...@metamask/phishing-controller@1.1.1
[1.1.0]: https://github.com/MetaMask/controllers/compare/@metamask/phishing-controller@1.0.0...@metamask/phishing-controller@1.1.0
[1.0.0]: https://github.com/MetaMask/controllers/releases/tag/@metamask/phishing-controller@1.0.0
