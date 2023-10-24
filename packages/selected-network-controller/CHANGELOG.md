# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.1.0]
### Added
- Add `getProviderAndBlockTracker` method to get a proxy provider from `NetworkController` for a given origin/domain. ([#1806](https://github.com/MetaMask/core/pull/1806))

### Changed
- No longer update `selectedNetworkClientId` when the `NetworkController` provider changes. ([#1806](https://github.com/MetaMask/core/pull/1806))
- Bump @metamask/auto-changelog from 3.2.0 to 3.4.0 ([#1870](https://github.com/MetaMask/core/pull/1870))

## [3.0.0]
### Changed
- **BREAKING:** Bump dependency and peer dependency on `@metamask/network-controller` to ^14.0.0 ([#1747](https://github.com/MetaMask/core/pull/1747))
- **BREAKING:** Move from `json-rpc-engine` ^7.1.1 to `@metamask/json-rpc-engine` ^8.0.0 ([#1653](https://github.com/MetaMask/core/pull/1653))
- **BREAKING:** Bump dependency and peer dependency on `@metamask/network-controller` to ^15.0.0
- Bump dependency on `@metamask/base-controller` to ^3.2.3 ([#1747](https://github.com/MetaMask/core/pull/1747))

### Fixed
- `setNetworkClientIdForDomain()` will now ignore the passed in domain value and set the `networkClientId` for the metamask domain instead when the `state.perDomainNetwork` flag is false (default) ([#1757](https://github.com/MetaMask/core/pull/1757))

## [2.0.1]
### Changed
- Update TypeScript to v4.8.x ([#1718](https://github.com/MetaMask/core/pull/1718))

## [2.0.0]
### Changed
- **BREAKING**: Bump peer dependency on `@metamask/network-controller` to ^13.0.0 ([#1633](https://github.com/MetaMask/core/pull/1633))

## [1.0.0]
### Added
- Initial Release ([#1643](https://github.com/MetaMask/core/pull/1643))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/selected-network-controller@3.1.0...HEAD
[3.1.0]: https://github.com/MetaMask/core/compare/@metamask/selected-network-controller@3.0.0...@metamask/selected-network-controller@3.1.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/selected-network-controller@2.0.1...@metamask/selected-network-controller@3.0.0
[2.0.1]: https://github.com/MetaMask/core/compare/@metamask/selected-network-controller@2.0.0...@metamask/selected-network-controller@2.0.1
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/selected-network-controller@1.0.0...@metamask/selected-network-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/selected-network-controller@1.0.0
