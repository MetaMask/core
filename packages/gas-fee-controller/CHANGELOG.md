# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [6.1.1]
### Uncategorized
- Replace `eth-query` ^2.1.2 with `@metamask/eth-query` ^3.0.1 ([#1546](https://github.com/MetaMask/core/pull/1546))

## [6.1.0]
### Changed
- Update `@metamask/utils` to `^6.2.0` ([#1514](https://github.com/MetaMask/core/pull/1514))
- Remove unnecessary `babel-runtime` dependencies ([#1504](https://github.com/MetaMask/core/pull/1504))

## [6.0.1]
### Changed
- Bump dependency on `controller-utils` ([#1447](https://github.com/MetaMask/core/pull/1447))
  - The new version of `controller-utils` adds `eth-query` to the list of dependencies. This dependency was added to improve internal types for `gas-fee-controller`. This has no impact on users of the package.

## [6.0.0]
### Changed
- **BREAKING:** Bump to Node 16 ([#1262](https://github.com/MetaMask/core/pull/1262))
- **BREAKING:** The `getChainId` constructor parameter now expects a `Hex` return type rather than a decimal string ([#1367](https://github.com/MetaMask/core/pull/1367))
- Add `@metamask/utils` dependency
- **BREAKING:** The gas fee controller messenger now requires the `NetworkController:stateChange` event instead of the `NetworkController:providerConfigChange` event ([#1329](https://github.com/MetaMask/core/pull/1329))
  - This does not apply if `onNetworkStateChange` and `getChainId` are provided to the constructor
- **BREAKING:** The constructor parameter `onNetworkStateChange` now expects event handlers to be passed the full network state ([#1329](https://github.com/MetaMask/core/pull/1329))
  - The type of the `onNetworkStateChange` parameter already expected the state to be provided, but it wasn't used before now
- **BREAKING:** Update `@metamask/network-controller` dependency and peer dependency

## [5.0.0]
### Changed
- **BREAKING**: peerDeps: @metamask/network-controller@6.0.0->8.0.0 ([#1196](https://github.com/MetaMask/core/pull/1196))

## [4.0.1]
### Changed
- Adjust types to align with new version of `NetworkController` ([#1091](https://github.com/MetaMask/core/pull/1091))

## [4.0.0]
### Changed
- **BREAKING:** Make the EIP-1559 endpoint a required argument ([#1083](https://github.com/MetaMask/core/pull/1083))

### Removed
- **BREAKING:** Remove `isomorphic-fetch` ([#1106](https://github.com/MetaMask/controllers/pull/1106))
  - Consumers must now import `isomorphic-fetch` or another polyfill themselves if they are running in an environment without `fetch`

## [3.0.0]
### Changed
- **BREAKING:** Update `@metamask/network-controller` peer dependency to v3 ([#1041](https://github.com/MetaMask/controllers/pull/1041))
- Rename this repository to `core` ([#1031](https://github.com/MetaMask/controllers/pull/1031))
- Update `@metamask/controller-utils` package ([#1041](https://github.com/MetaMask/controllers/pull/1041))

## [2.0.1]
### Fixed
- This package will now warn if a required package is not present ([#1003](https://github.com/MetaMask/core/pull/1003))

## [2.0.0]
### Changed
- **BREAKING:** Bump `@metamask/network-controller` to 2.0.0 ([#995](https://github.com/MetaMask/core/pull/995))
  - GasFeeController now expects NetworkController to respond to the `NetworkController:providerChangeConfig` event (previously named `NetworkController:providerChange`). If you are depending directly on `@metamask/network-controller`, you should update your version to at least 2.0.0 as well.
- Relax dependencies on `@metamask/base-controller`, `@metamask/controller-utils`, and `@metamask/network-controller` (use `^` instead of `~`) ([#998](https://github.com/MetaMask/core/pull/998))

## [1.0.0]
### Added
- Initial release
  - As a result of converting our shared controllers repo into a monorepo ([#831](https://github.com/MetaMask/core/pull/831)), we've created this package from select parts of [`@metamask/controllers` v33.0.0](https://github.com/MetaMask/core/tree/v33.0.0), namely:
    - Everything in `src/gas`

    All changes listed after this point were applied to this package following the monorepo conversion.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@6.1.1...HEAD
[6.1.1]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@6.1.0...@metamask/gas-fee-controller@6.1.1
[6.1.0]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@6.0.1...@metamask/gas-fee-controller@6.1.0
[6.0.1]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@6.0.0...@metamask/gas-fee-controller@6.0.1
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@5.0.0...@metamask/gas-fee-controller@6.0.0
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@4.0.1...@metamask/gas-fee-controller@5.0.0
[4.0.1]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@4.0.0...@metamask/gas-fee-controller@4.0.1
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@3.0.0...@metamask/gas-fee-controller@4.0.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@2.0.1...@metamask/gas-fee-controller@3.0.0
[2.0.1]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@2.0.0...@metamask/gas-fee-controller@2.0.1
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@1.0.0...@metamask/gas-fee-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/gas-fee-controller@1.0.0
