# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- chore: export controller messenger type to index ([#5296](https://github.com/MetaMask/core/pull/5296))

### Added

- Export `TokenSearchDiscoveryControllerMessenger` type from package index

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/token-search-discovery-controller@2.0.0...HEAD
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/token-search-discovery-controller@1.0.0...@metamask/token-search-discovery-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/token-search-discovery-controller@1.0.0
