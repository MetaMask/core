# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [22.0.0]

### Changed

- **BREAKING:** Bump `@metamask/network-controller` peer dependency to `^22.0.0` ([#4841](https://github.com/MetaMask/core/pull/4841))
- Bump `@metamask/controller-utils` to `^11.4.0` ([#4834](https://github.com/MetaMask/core/pull/4834))
- Bump `@metamask/utils` to `^10.0.0` ([#4831](https://github.com/MetaMask/core/pull/4831))

## [21.0.0]

### Changed

- **BREAKING:** `GasFeeController` now uses a new polling interface that accepts the generic parameter `PollingInput` ([#4752](https://github.com/MetaMask/core/pull/4752))
- **BREAKING:** The inherited `AbstractPollingController` method `startPollingByNetworkClientId` has been renamed to `startPolling` ([#4752](https://github.com/MetaMask/core/pull/4752))
- **BREAKING:** The inherited `AbstractPollingController` method `onPollingComplete` now returns the entire input object of type `PollingInput`, instead of a network client id ([#4752](https://github.com/MetaMask/core/pull/4752))

## [20.0.1]

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

## [20.0.0]

### Changed

- **BREAKING:** Bump devDependency and peerDependency `@metamask/network-controller` from `^20.0.0` to `^21.0.0` ([#4618](https://github.com/MetaMask/core/pull/4618), [#4651](https://github.com/MetaMask/core/pull/4651))
- Bump `@metamask/base-controller` from `^6.0.2` to `^7.0.0` ([#4625](https://github.com/MetaMask/core/pull/4625), [#4643](https://github.com/MetaMask/core/pull/4643))
- Bump `@metamask/controller-utils` from `^11.0.2` to `^11.2.0` ([#4639](https://github.com/MetaMask/core/pull/4639), [#4651](https://github.com/MetaMask/core/pull/4651))
- Bump `@metamask/polling-controller` from `^9.0.1` to `^10.0.0` ([#4651](https://github.com/MetaMask/core/pull/4651))
- Bump `typescript` from `~5.0.4` to `~5.2.2` ([#4576](https://github.com/MetaMask/core/pull/4576), [#4584](https://github.com/MetaMask/core/pull/4584))

## [19.0.1]

### Changed

- Remove `@metamask/network-controller` dependency [#4556](https://github.com/MetaMask/core/pull/4556)
  - This was listed under `peerDependencies` already, so it was redundant as a dependency.
- Upgrade TypeScript version to `~5.0.4` and set `moduleResolution` option to `Node16` ([#3645](https://github.com/MetaMask/core/pull/3645))
- Bump `@metamask/base-controller` from `^6.0.0` to `^6.0.2` ([#4517](https://github.com/MetaMask/core/pull/4517), [#4544](https://github.com/MetaMask/core/pull/4544))
- Bump `@metamask/controller-utils` from `^11.0.0` to `^11.0.2` ([#4517](https://github.com/MetaMask/core/pull/4517), [#4544](https://github.com/MetaMask/core/pull/4544))
- Bump `@metamask/polling-controller` from `^9.0.0` to `^9.0.1` ([#4548](https://github.com/MetaMask/core/pull/4548))
- Bump `@metamask/utils` from `^8.3.0` to `^9.1.0` ([#4516](https://github.com/MetaMask/core/pull/4516), [#4529](https://github.com/MetaMask/core/pull/4529))

## [19.0.0]

### Changed

- **BREAKING:** Bump peerDependency `@metamask/network-controller` to `^20.0.0` ([#4508](https://github.com/MetaMask/core/pull/4508))
- Bump `@metamask/polling-controller` to `^9.0.0` ([#4508](https://github.com/MetaMask/core/pull/4508))

## [18.0.0]

### Added

- **BREAKING:** Add constructor options to `GasFeeController`: `EIP1559APIEndpoint` (required), and `legacyAPIEndpoint` (optional) which defaults to `LEGACY_GAS_PRICES_API_URL`. ([#4446](https://github.com/MetaMask/core/pull/4446))
  - These URLs are no longer hardcoded within the controller.

### Removed

- **BREAKING:** Remove `infuraAPIKey` as a constructor option for `GasFeeController`. This class field was previously used to construct and send the `Authorization` header for Infura gas API requests. ([#4446](https://github.com/MetaMask/core/pull/4446))

## [17.0.0]

### Changed

- **BREAKING:** Bump minimum Node version to 18.18 ([#3611](https://github.com/MetaMask/core/pull/3611))
- **BREAKING:** Bump dependency and peer dependency `@metamask/network-controller` to `^19.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- Bump `@metamask/base-controller` to `^6.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- Bump `@metamask/controller-utils` to `^11.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- Bump `@metamask/polling-controller` to `^8.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))

## [16.0.0]

### Changed

- **BREAKING:** Bump dependency and peer dependency `@metamask/network-controller` to `^18.1.3` ([#4342](https://github.com/MetaMask/core/pull/4342))
- Bump `@metamask/controller-utils` to `^10.0.0` ([#4342](https://github.com/MetaMask/core/pull/4342))
- Bump `@metamask/polling-controller` to `^7.0.0` ([#4342](https://github.com/MetaMask/core/pull/4342))

## [15.1.2]

### Fixed

- Add a metadata property for nonRPCGasFeeApisDisabled ([#4245](https://github.com/MetaMask/core/pull/4245))

## [15.1.1]

### Changed

- Bump `@metamask/polling-controller` to `^6.0.2` ([#4234](https://github.com/MetaMask/core/pull/4234))

### Removed

- Remove fee history fallback in favour of `eth_gasPrice` call ([#4210](https://github.com/MetaMask/core/pull/4210))

## [15.1.0]

### Added

- Add nonRPCGasFeeApisDisabled property to the gas fee controller, allowing the user to specify that they want to prevent network request to gas estimate services, and only want gas estimates to be based on rpc requests (eth_feeHistory and eth_gasPrice) to the provider. ([#4094](https://github.com/MetaMask/core.git/pull/4094))

### Fixed

- Fix GasFeeController incorrectly setting globally selected state, so that state is only updated if the gasFeeEstimate fetched is for the currently selected network ([#4214](https://github.com/MetaMask/core.git/pull/4214))

## [15.0.0]

### Changed

- **BREAKING**: The controller's constructor now requires `infuraAPIKey`. This is used to construct and send the `Authorization` header for Infura gas API requests. ([#4068](https://github.com/MetaMask/core/pull/4068))
- Bump dependency `@metamask/network-controller` to `^18.1.0` ([#4121](https://github.com/MetaMask/core/pull/4121))

### Removed

- **BREAKING**: Remove the constructor options `legacyAPIEndpoint` and `EIP1559APIEndpoint`. These URLs are now hardcoded within the controller. ([#4068](https://github.com/MetaMask/core/pull/4068))

## [14.0.1]

### Fixed

- Fix `types` field in `package.json` ([#4047](https://github.com/MetaMask/core/pull/4047))

## [14.0.0]

### Added

- **BREAKING**: Add ESM build ([#3998](https://github.com/MetaMask/core/pull/3998))
  - It's no longer possible to import files from `./dist` directly.

### Changed

- **BREAKING:** Bump `@metamask/base-controller` to `^5.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
  - This version has a number of breaking changes. See the changelog for more.
- **BREAKING:** Bump dependency and peer dependency on `@metamask/network-controller` to `^18.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
- Bump `@metamask/controller-utils` to `^9.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
- Bump `@metamask/polling-controller` to `^6.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))

## [13.0.2]

### Changed

- Replace `ethereumjs-util` with `bn.js` ([#3943](https://github.com/MetaMask/core/pull/3943))
- Bump `@metamask/controller-utils` to `^8.0.4` ([#4007](https://github.com/MetaMask/core/pull/4007))
- Bump `@metamask/ethjs-unit` to `^0.3.0` ([#3897](https://github.com/MetaMask/core/pull/3897))
- Bump `@metamask/network-controller` to `^17.2.1` ([#4007](https://github.com/MetaMask/core/pull/4007))
- Bump `@metamask/polling-controller` to `^5.0.1` ([#4007](https://github.com/MetaMask/core/pull/4007))

## [13.0.1]

### Changed

- Bump `@metamask/controller-utils` to `^8.0.3` ([#3915](https://github.com/MetaMask/core/pull/3915))

## [13.0.0]

### Changed

- **BREAKING:** Bump `@metamask/network-controller` peer dependency to `^17.2.0` ([#3821](https://github.com/MetaMask/core/pull/3821))
- Bump `@metamask/utils` to `^8.3.0` ([#3769](https://github.com/MetaMask/core/pull/3769))
- Bump `@metamask/base-controller` to `^4.1.1` ([#3760](https://github.com/MetaMask/core/pull/3760), [#3821](https://github.com/MetaMask/core/pull/3821))
- Bump `@metamask/controller-utils` to `^8.0.2` ([#3821](https://github.com/MetaMask/core/pull/3821))
- Bump `@metamask/polling-controller` to `^5.0.0` ([#3821](https://github.com/MetaMask/core/pull/3821))

## [12.0.0]

### Changed

- **BREAKING:** Bump `@metamask/network-controller` dependency and peer dependency from `^17.0.0` to `^17.1.0` ([#3695](https://github.com/MetaMask/core/pull/3695))
- **BREAKING:** The `GasFeeController` now detects network changes using the `NetworkController:networkDidChange` event instead of `NetworkController:stateChange` ([#3610](https://github.com/MetaMask/core/pull/3610))
  - Additionally, the optional constructor parameter `onNetworkStateChange` has been replaced by `onNetworkDidChange`
- Bump `@metamask/base-controller` to `^4.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695))
- Bump `@metamask/controller-utils` to `^8.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695), [#3678](https://github.com/MetaMask/core/pull/3678), [#3667](https://github.com/MetaMask/core/pull/3667), [#3580](https://github.com/MetaMask/core/pull/3580))
- Bump `@metamask/polling-controller` to `^4.0.0` ([#3695](https://github.com/MetaMask/core/pull/3695), [#3667](https://github.com/MetaMask/core/pull/3667), [#3636](https://github.com/MetaMask/core/pull/3636))
  - This update adds two new methods to each polling controller: `_startPollingByNetworkClientId` and `_stopPollingByPollingTokenSetId`. These methods are intended for internal use, and should not be called directly.

## [11.0.0]

### Changed

- **BREAKING:** Bump `@metamask/base-controller` to ^4.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
  - This is breaking because the type of the `messenger` has backward-incompatible changes. See the changelog for this package for more.
- Replace `ethjs-unit` ^0.1.6 with `@metamask/ethjs-unit` ^0.2.1 ([#2064](https://github.com/MetaMask/core/pull/2064))
- Bump `@metamask/controller-utils` to ^6.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
- Bump `@metamask/network-controller` to ^17.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
- Bump `@metamask/polling-controller` to ^2.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))

## [10.0.1]

### Changed

- **BREAKING:** Bump dependency and peer dependency on `@metamask/network-controller` to ^16.0.0
- Bump dependency `@metamask/eth-query` from ^3.0.1 to ^4.0.0 ([#2028](https://github.com/MetaMask/core/pull/2028))
- Bump dependency on `@metamask/polling-controller` to ^1.0.2
- Bump @metamask/utils from 8.1.0 to 8.2.0 ([#1957](https://github.com/MetaMask/core/pull/1957))

## [10.0.0]

### Added

- Add optional `networkClientId` argument to options object param of `fetchGasFeeEstimates` method which, if passed, fetches the required chainId and networkClient provider to fetch and store gasFee data appropriately. ([#1891](https://github.com/MetaMask/core/pull/1891))

### Changed

- **BREAKING:** Bump dependency on `@metamask/polling-controller` to ^1.0.0
- Bump dependency and peer dependency on `@metamask/network-controller` to ^15.1.0

## [9.0.0]

### Added

- Add way to start and stop different polling sessions for the same network client ID by providing extra scoping data ([#1776](https://github.com/MetaMask/core/pull/1776))
  - Add optional second argument to `stopPollingByPollingToken` (formerly `stopPollingByNetworkClientId`)
  - Add optional second argument to `onPollingCompleteByNetworkClientId`

### Changed

- **BREAKING:** Make `executePoll` private ([#1810](https://github.com/MetaMask/core/pull/1810))
- **BREAKING:** Rename `stopPollingByNetworkClientId` to `stopPollingByPollingToken` ([#1810](https://github.com/MetaMask/core/pull/1810))
- **BREAKING:** Bump dependency and peer dependency on `@metamask/network-controller` to ^15.0.0
- **BREAKING:** Bump dependency on `@metamask/polling-controller` to ^0.2.0

## [8.0.0]

### Added

- Add optional `gasFeeEstimatesByChainId` property to GasFeeController state ([#1673](https://github.com/MetaMask/core/pull/1673)
- Add dependency on `@metamask/polling-controller` ([#1748])(https://github.com/MetaMask/core/pull/1748))

### Changed

- **BREAKING:** Messenger must allow controller actions `NetworkController:getNetworkClientById` and `NetworkController:getEIP1559Compatibility` ([#1673](https://github.com/MetaMask/core/pull/1673)
- Bump dependency on `@metamask/utils` to ^8.1.0 ([#1639](https://github.com/MetaMask/core/pull/1639))
- Bump dependency on `@metamask/base-controller` to ^3.2.3
- Bump dependency on `@metamask/controller-utils` to ^5.0.2
- Bump dependency and peer dependency on `@metamask/network-controller` to ^14.0.0

## [7.0.1]

### Changed

- Update TypeScript to v4.8.x ([#1718](https://github.com/MetaMask/core/pull/1718))

## [7.0.0]

### Changed

- **BREAKING**: Bump peer dependency on `@metamask/network-controller` to ^13.0.0 ([#1633](https://github.com/MetaMask/core/pull/1633))
- Bump dependency on `@metamask/controller-utils` to ^5.0.0 ([#1633](https://github.com/MetaMask/core/pull/1633))

## [6.1.2]

### Changed

- Bump dependency on `@metamask/base-controller` to ^3.2.1
- Bump dependency on `@metamask/controller-utils` to ^4.3.2
- Bump dependency and peer dependency on `@metamask/network-controller` to ^12.1.2

## [6.1.1]

### Changed

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@22.0.0...HEAD
[22.0.0]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@21.0.0...@metamask/gas-fee-controller@22.0.0
[21.0.0]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@20.0.1...@metamask/gas-fee-controller@21.0.0
[20.0.1]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@20.0.0...@metamask/gas-fee-controller@20.0.1
[20.0.0]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@19.0.1...@metamask/gas-fee-controller@20.0.0
[19.0.1]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@19.0.0...@metamask/gas-fee-controller@19.0.1
[19.0.0]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@18.0.0...@metamask/gas-fee-controller@19.0.0
[18.0.0]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@17.0.0...@metamask/gas-fee-controller@18.0.0
[17.0.0]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@16.0.0...@metamask/gas-fee-controller@17.0.0
[16.0.0]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@15.1.2...@metamask/gas-fee-controller@16.0.0
[15.1.2]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@15.1.1...@metamask/gas-fee-controller@15.1.2
[15.1.1]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@15.1.0...@metamask/gas-fee-controller@15.1.1
[15.1.0]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@15.0.0...@metamask/gas-fee-controller@15.1.0
[15.0.0]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@14.0.1...@metamask/gas-fee-controller@15.0.0
[14.0.1]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@14.0.0...@metamask/gas-fee-controller@14.0.1
[14.0.0]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@13.0.2...@metamask/gas-fee-controller@14.0.0
[13.0.2]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@13.0.1...@metamask/gas-fee-controller@13.0.2
[13.0.1]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@13.0.0...@metamask/gas-fee-controller@13.0.1
[13.0.0]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@12.0.0...@metamask/gas-fee-controller@13.0.0
[12.0.0]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@11.0.0...@metamask/gas-fee-controller@12.0.0
[11.0.0]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@10.0.1...@metamask/gas-fee-controller@11.0.0
[10.0.1]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@10.0.0...@metamask/gas-fee-controller@10.0.1
[10.0.0]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@9.0.0...@metamask/gas-fee-controller@10.0.0
[9.0.0]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@8.0.0...@metamask/gas-fee-controller@9.0.0
[8.0.0]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@7.0.1...@metamask/gas-fee-controller@8.0.0
[7.0.1]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@7.0.0...@metamask/gas-fee-controller@7.0.1
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@6.1.2...@metamask/gas-fee-controller@7.0.0
[6.1.2]: https://github.com/MetaMask/core/compare/@metamask/gas-fee-controller@6.1.1...@metamask/gas-fee-controller@6.1.2
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
