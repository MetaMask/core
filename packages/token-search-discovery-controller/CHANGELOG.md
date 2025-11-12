# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- chore: Update `typescript` to v5.3 ([#7081](https://github.com/MetaMask/core/pull/7081))
- fix: Fix build script not working because of missing `@ts-bridge/cli` dependency ([#7040](https://github.com/MetaMask/core/pull/7040))

## [4.0.0]

### Changed

- **BREAKING:** Use new `Messenger` from `@metamask/messenger` ([#6495](https://github.com/MetaMask/core/pull/6495))
  - Previously, `TokenSearchDiscoveryController` accepted a `RestrictedMessenger` instance from `@metamask/base-controller`.
- **BREAKING:** Metadata property `anonymous` renamed to `includeInDebugSnapshot` ([#6495](https://github.com/MetaMask/core/pull/6495))
- Bump `@metamask/base-controller` from `^8.4.2` to `^9.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))

## [3.5.1]

### Changed

- Bump `@metamask/base-controller` from `^8.4.1` to `^8.4.2` ([#6917](https://github.com/MetaMask/core/pull/6917))

## [3.5.0]

### Added

- Export additional controller types from package index ([#6837](https://github.com/MetaMask/core/pull/6837))
  - Export `TokenSearchDiscoveryControllerActions` - union type of all controller actions
  - Export `TokenSearchDiscoveryControllerGetStateAction` - action type for getting controller state
  - Export `TokenSearchDiscoveryControllerEvents` - union type of all controller events
  - Export `TokenSearchDiscoveryControllerStateChangeEvent` - state change event type

## [3.4.0]

### Added

- Add two new controller state metadata properties: `includeInStateLogs` and `usedInUi` ([#6586](https://github.com/MetaMask/core/pull/6586))

### Changed

- Bump `@metamask/base-controller` from `^8.0.1` to `^8.4.1` ([#6284](https://github.com/MetaMask/core/pull/6284), [#6355](https://github.com/MetaMask/core/pull/6355), [#6465](https://github.com/MetaMask/core/pull/6465), [#6632](https://github.com/MetaMask/core/pull/6632), [#6807](https://github.com/MetaMask/core/pull/6807))
- Bump `@metamask/utils` from `^11.2.0` to `^11.8.1` ([#6054](https://github.com/MetaMask/core/pull/6054), [#6588](https://github.com/MetaMask/core/pull/6588), [#6708](https://github.com/MetaMask/core/pull/6708))

## [3.3.0]

### Added

- Add formatted search function to token discovery controller ([#5932](https://github.com/MetaMask/core/pull/5932))

## [3.2.0]

### Changed

- Bump `@metamask/base-controller` from ^8.0.0 to ^8.0.1 ([#5722](https://github.com/MetaMask/core/pull/5722))
- Add `swappable` param to token discovery controller and API service ([#5819](https://github.com/MetaMask/core/pull/5819))

## [3.1.0]

### Added

- Export `SwappableTokenSearchParams` type ([#5654](https://github.com/MetaMask/core/pull/5654))

## [3.0.0]

### Added

- Add swappable token search to the `TokenDiscoveryApiService` ([#5640](https://github.com/MetaMask/core/pull/5640))
- Add support for blue-chip endpoint ([#5588](https://github.com/MetaMask/core/pull/5588))
- Add `getTopGainers` and `getTopLosers` to `TokenSearchDiscoveryController` ([#5309](https://github.com/MetaMask/core/pull/5309))

### Changed

- **BREAKING:** Renamed `TokenTrendingResponseItem` name to `MoralisTokenResponseItem`
- Bump `@metamask/utils` from `^11.1.0` to `^11.2.0` ([#5301](https://github.com/MetaMask/core/pull/5301))

## [2.1.0]

### Added

- Export `TokenSearchDiscoveryControllerMessenger` type ([#5296](https://github.com/MetaMask/core/pull/5296))

### Changed

- Bump `@metamask/base-controller` from `^7.1.1` to `^8.0.0` ([#5305](https://github.com/MetaMask/core/pull/5305))

## [2.0.0]

### Added

- Introduce the `logoUrl` property to the `TokenSearchApiService` response ([#5195](https://github.com/MetaMask/core/pull/5195))
  - Specifically in the `TokenSearchResponseItem` type
- Introduce `TokenDiscoveryApiService` to keep discovery and search responsibilities separate ([#5214](https://github.com/MetaMask/core/pull/5214))
  - This service is responsible for fetching discover related data
  - Add `getTrendingTokens` method to fetch trending tokens by chain
  - Add `TokenTrendingResponseItem` type for trending token responses
- Export `TokenSearchResponseItem` type from the package index ([#5214](https://github.com/MetaMask/core/pull/5214))

### Changed

- Bump @metamask/utils to v11.1.0 ([#5223](https://github.com/MetaMask/core/pull/5223))
- Update the `TokenSearchApiService` to use the updated URL for `searchTokens` ([#5195](https://github.com/MetaMask/core/pull/5195))
  - The URL is now `/tokens-search` instead of `/tokens-search/name`
- **BREAKING:** The `searchTokens` method now takes a `query` parameter instead of `name` ([#5195](https://github.com/MetaMask/core/pull/5195))

## [1.0.0]

### Added

- Introduce the TokenSearchDiscoveryController ([#5142](https://github.com/MetaMask/core/pull/5142/))
  - This controller manages token search and discovery through the Portfolio API
- Introduce the TokenSearchApiService ([#5142](https://github.com/MetaMask/core/pull/5142/))
  - This service is responsible for making search related requests to the Portfolio API
  - Specifically, it handles the `tokens-search` endpoint which returns a list of tokens based on the provided query parameters

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/token-search-discovery-controller@4.0.0...HEAD
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/token-search-discovery-controller@3.5.1...@metamask/token-search-discovery-controller@4.0.0
[3.5.1]: https://github.com/MetaMask/core/compare/@metamask/token-search-discovery-controller@3.5.0...@metamask/token-search-discovery-controller@3.5.1
[3.5.0]: https://github.com/MetaMask/core/compare/@metamask/token-search-discovery-controller@3.4.0...@metamask/token-search-discovery-controller@3.5.0
[3.4.0]: https://github.com/MetaMask/core/compare/@metamask/token-search-discovery-controller@3.3.0...@metamask/token-search-discovery-controller@3.4.0
[3.3.0]: https://github.com/MetaMask/core/compare/@metamask/token-search-discovery-controller@3.2.0...@metamask/token-search-discovery-controller@3.3.0
[3.2.0]: https://github.com/MetaMask/core/compare/@metamask/token-search-discovery-controller@3.1.0...@metamask/token-search-discovery-controller@3.2.0
[3.1.0]: https://github.com/MetaMask/core/compare/@metamask/token-search-discovery-controller@3.0.0...@metamask/token-search-discovery-controller@3.1.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/token-search-discovery-controller@2.1.0...@metamask/token-search-discovery-controller@3.0.0
[2.1.0]: https://github.com/MetaMask/core/compare/@metamask/token-search-discovery-controller@2.0.0...@metamask/token-search-discovery-controller@2.1.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/token-search-discovery-controller@1.0.0...@metamask/token-search-discovery-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/token-search-discovery-controller@1.0.0
