# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **BREAKING:** Upgrade `@tanstack/query-core` and `@tanstack/react-query` from `^4.43.0` to `^5.62.16` ([#9563](https://github.com/MetaMask/core/pull/9563))
  - `createUIQueryClient`'s `invalidateQueries` override now matches the TanStack Query v5 signature (`filters`, `options`) instead of the v4 overload style that relied on `parseFilterArgs`.
  - Consumers must migrate to TanStack Query v5 APIs (for example `gcTime` instead of `cacheTime`, and `initialPageParam` for infinite queries).

## [0.2.2]

### Changed

- Bump `@metamask/utils` from `^11.9.0` to `^11.11.0` ([#9074](https://github.com/MetaMask/core/pull/9074))
- Make `react-dom` and `react-native` peer dependencies optional ([#9295](https://github.com/MetaMask/core/pull/9295))

### Fixed

- Retain queries in cache until GC ([#9502](https://github.com/MetaMask/core/pull/9502))

## [0.2.1]

### Changed

- Bump `@metamask/base-data-service` from `^0.1.0` to `^0.1.3` ([#8317](https://github.com/MetaMask/core/pull/8317), [#8755](https://github.com/MetaMask/core/pull/8755), [#8799](https://github.com/MetaMask/core/pull/8799))

## [0.2.0]

### Added

- Allow passing additional configuration options to `createUIQueryClient` ([#8295](https://github.com/MetaMask/core/pull/8295))
- Move data service specific query configuration to hooks instead of `QueryClient` defaults ([#8296](https://github.com/MetaMask/core/pull/8296))

## [0.1.0]

### Added

- Initial release ([#8039](https://github.com/MetaMask/core/pull/8039), [#8292](https://github.com/MetaMask/core/pull/8292))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/react-data-query@0.2.2...HEAD
[0.2.2]: https://github.com/MetaMask/core/compare/@metamask/react-data-query@0.2.1...@metamask/react-data-query@0.2.2
[0.2.1]: https://github.com/MetaMask/core/compare/@metamask/react-data-query@0.2.0...@metamask/react-data-query@0.2.1
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/react-data-query@0.1.0...@metamask/react-data-query@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/react-data-query@0.1.0
