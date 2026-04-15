# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- Revert "Release 912.0.0 (#8451)" ([#8451](https://github.com/MetaMask/core/pull/8451))
- Release 912.0.0 ([#8451](https://github.com/MetaMask/core/pull/8451))
- chore: bump `@metamask/auto-changelog` to `^6.0.0` ([#8441](https://github.com/MetaMask/core/pull/8441))
- chore: Use Oxfmt for import sorting instead of `import-x/order` ([#8438](https://github.com/MetaMask/core/pull/8438))
- chore: Replace Prettier with Oxfmt ([#8434](https://github.com/MetaMask/core/pull/8434))
- chore: secure PUBLISH_PREVIEW_NPM_TOKEN with GitHub environment ([#8011](https://github.com/MetaMask/core/pull/8011))
- chore: upgrade `typedoc` from `^0.24.8` to `^0.25.13` ([#7898](https://github.com/MetaMask/core/pull/7898))
- chore: migrate Jest from v27 to v29 ([#7894](https://github.com/MetaMask/core/pull/7894))
- chore: upgrade Jest-related packages to latest 27.x versions ([#7792](https://github.com/MetaMask/core/pull/7792))
- Release/763.0.0 ([#7713](https://github.com/MetaMask/core/pull/7713))
- chore(lint): Fix suppressed ESLint errors in `multichain-network-controller` package ([#7491](https://github.com/MetaMask/core/pull/7491))
- chore: Update ESLint config packages to v15 ([#7305](https://github.com/MetaMask/core/pull/7305))
- Revert "Release 687.0.0" ([#7201](https://github.com/MetaMask/core/pull/7201))
- Release 687.0.0 ([#7190](https://github.com/MetaMask/core/pull/7190))
- chore: Update `typescript` to v5.3 ([#7081](https://github.com/MetaMask/core/pull/7081))
- fix: Fix build script not working because of missing `@ts-bridge/cli` dependency ([#7040](https://github.com/MetaMask/core/pull/7040))
- Release/650.0.0 ([#7003](https://github.com/MetaMask/core/pull/7003))
- feat: New `base-controller` API ([#6926](https://github.com/MetaMask/core/pull/6926))
- Release 641.0.0 ([#6940](https://github.com/MetaMask/core/pull/6940))
- Release/624.0.0 ([#6845](https://github.com/MetaMask/core/pull/6845))
- Release/573.0.0 ([#6678](https://github.com/MetaMask/core/pull/6678))
- Release/549.0.0 ([#6590](https://github.com/MetaMask/core/pull/6590))
- Release/546.0.0 ([#6572](https://github.com/MetaMask/core/pull/6572))
- Release/492.0.0 ([#6273](https://github.com/MetaMask/core/pull/6273))
- Release/479.0.0 ([#6194](https://github.com/MetaMask/core/pull/6194))
- feat(multichain-account-service): re-sync multichain account and wallets on account events ([#6165](https://github.com/MetaMask/core/pull/6165))
- Release/470.0.0 ([#6148](https://github.com/MetaMask/core/pull/6148))
- Release 465.0.0 ([#6114](https://github.com/MetaMask/core/pull/6114))
- Release 456.0.0 ([#6064](https://github.com/MetaMask/core/pull/6064))
- Release 429.0.0 ([#5930](https://github.com/MetaMask/core/pull/5930))
- Release 416.0.0 ([#5885](https://github.com/MetaMask/core/pull/5885))
- Release 415.0.0 ([#5882](https://github.com/MetaMask/core/pull/5882))
- Release 384.0.0 ([#5749](https://github.com/MetaMask/core/pull/5749))
- Release 381.0.0 ([#5729](https://github.com/MetaMask/core/pull/5729))
- Release 376.0.0 ([#5713](https://github.com/MetaMask/core/pull/5713))
- Release/371.0.0 ([#5678](https://github.com/MetaMask/core/pull/5678))
- Release/367.0.0 ([#5669](https://github.com/MetaMask/core/pull/5669))
- Release 363.0.0 ([#5658](https://github.com/MetaMask/core/pull/5658))
- Release/359.0.0 ([#5649](https://github.com/MetaMask/core/pull/5649))
- Release/353.0.0 ([#5612](https://github.com/MetaMask/core/pull/5612))
- Release 347.0.0 ([#5583](https://github.com/MetaMask/core/pull/5583))
- Release 343.0.0 ([#5542](https://github.com/MetaMask/core/pull/5542))
- Release 338.0.0 ([#5518](https://github.com/MetaMask/core/pull/5518))
- Fix dependency-related constraints ([#5464](https://github.com/MetaMask/core/pull/5464))
- Revert "Release 319.0.0 (#5437)" ([#5437](https://github.com/MetaMask/core/pull/5437))
- Release 319.0.0 ([#5437](https://github.com/MetaMask/core/pull/5437))
- fix: revert release changelog entries ([#5428](https://github.com/MetaMask/core/pull/5428))
- Release 306.0.0 ([#5373](https://github.com/MetaMask/core/pull/5373))
- Release 303.0.0 ([#5357](https://github.com/MetaMask/core/pull/5357))
- Release/300.0.0 ([#5340](https://github.com/MetaMask/core/pull/5340))
- Release 299.0.0 ([#5318](https://github.com/MetaMask/core/pull/5318))
- fix: fix peer deps for `@metamask/{accounts,multichain-network}-controller` ([#5327](https://github.com/MetaMask/core/pull/5327))
- Follow up comments in MultichainNetworkController PR ([#5320](https://github.com/MetaMask/core/pull/5320))

### Added

- Export `MultichainNetworkControllerGetNetworksWithTransactionActivityByAccountsAction` ([#8391](https://github.com/MetaMask/core/pull/8391))

### Changed

- Bump `@metamask/accounts-controller` from `^37.1.0` to `^37.2.0` ([#8325](https://github.com/MetaMask/core/pull/8325), [#8363](https://github.com/MetaMask/core/pull/8363))
- Bump `@metamask/controller-utils` from `^11.19.0` to `^11.20.0` ([#8344](https://github.com/MetaMask/core/pull/8344))
- Bump `@metamask/messenger` from `^1.0.0` to `^1.1.1` ([#8364](https://github.com/MetaMask/core/pull/8364), [#8373](https://github.com/MetaMask/core/pull/8373))
- Bump `@metamask/base-controller` from `^9.0.1` to `^9.1.0` ([#8457](https://github.com/MetaMask/core/pull/8457))

## [3.0.6]

### Changed

- Bump `@metamask/accounts-controller` from `^37.0.0` to `^37.1.0` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/base-controller` from `^9.0.0` to `^9.0.1` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/messenger` from `^0.3.0` to `^1.0.0` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/network-controller` from `^30.0.0` to `^30.0.1` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/keyring-api` from `^21.5.0` to `^21.6.0` ([#8259](https://github.com/MetaMask/core/pull/8259))

## [3.0.5]

### Changed

- Bump `@metamask/accounts-controller` from `^36.0.1` to `^37.0.0` ([#8140](https://github.com/MetaMask/core/pull/8140))

## [3.0.4]

### Changed

- Bump `@metamask/accounts-controller` from `^36.0.0` to `^36.0.1` ([#7996](https://github.com/MetaMask/core/pull/7996))
- Bump `@metamask/network-controller` from `^29.0.0` to `^30.0.0` ([#7996](https://github.com/MetaMask/core/pull/7996))
- Bump `@metamask/controller-utils` from `^11.18.0` to `^11.19.0` ([#7995](https://github.com/MetaMask/core/pull/7995))

## [3.0.3]

### Changed

- Bump `@metamask/accounts-controller` from `^35.0.2` to `^36.0.0` ([#7897](https://github.com/MetaMask/core/pull/7897))
- Bump `@metamask/keyring-api` from `^21.0.0` to `^21.5.0` ([#7857](https://github.com/MetaMask/core/pull/7857))
- Bump `@metamask/keyring-internal-api` from `^9.0.0` to `^10.0.0` ([#7857](https://github.com/MetaMask/core/pull/7857))

## [3.0.2]

### Changed

- Bump `@metamask/accounts-controller` from `^35.0.1` to `^35.0.2` ([#7642](https://github.com/MetaMask/core/pull/7642))
- Bump `@metamask/network-controller` from `^28.0.0` to `^29.0.0` ([#7642](https://github.com/MetaMask/core/pull/7642))

## [3.0.1]

### Changed

- Upgrade `@metamask/utils` from `^11.8.1` to `^11.9.0` ([#7511](https://github.com/MetaMask/core/pull/7511))
- Move peer dependencies for controller and service packages to direct dependencies ([#7209](https://github.com/MetaMask/core/pull/7209), [#7258](https://github.com/MetaMask/core/pull/7258), [#7534](https://github.com/MetaMask/core/pull/7534), [#7583](https://github.com/MetaMask/core/pull/7583), [#7604](https://github.com/MetaMask/core/pull/7604))
  - The dependencies moved are:
    - `@metamask/accounts-controller` (^35.0.1)
    - `@metamask/network-controller` (^28.0.0)
  - In clients, it is now possible for multiple versions of these packages to exist in the dependency tree.
    - For example, this scenario would be valid: a client relies on `@metamask/controller-a` 1.0.0 and `@metamask/controller-b` 1.0.0, and `@metamask/controller-b` depends on `@metamask/controller-a` 1.1.0.
  - Note, however, that the versions specified in the client's `package.json` always "win", and you are expected to keep them up to date so as not to break controller and service intercommunication.
- Bump `@metamask/controller-utils` from `^11.16.0` to `^11.18.0` ([#7534](https://github.com/MetaMask/core/pull/7534), [#7583](https://github.com/MetaMask/core/pull/7583))

## [3.0.0]

### Changed

- Bump `@metamask/controller-utils` from `^11.15.0` to `^11.16.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- **BREAKING:** Bump `@metamask/network-controller` from `^25.0.0` to `^26.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- **BREAKING:** Bump `@metamask/accounts-controller` from `^34.0.0` to `^35.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))

## [2.0.0]

### Changed

- **BREAKING:** Use new `Messenger` from `@metamask/messenger` ([#6543](https://github.com/MetaMask/core/pull/6543))
  - Previously, `MultichainNetworkController` accepted a `RestrictedMessenger` instance from `@metamask/base-controller`.
- **BREAKING:** Metadata property `anonymous` renamed to `includeInDebugSnapshot` ([#6543](https://github.com/MetaMask/core/pull/6543))
- **BREAKING:** Bump `@metamask/accounts-controller` from `^33.0.0` to `^34.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))
- **BREAKING:** Bump `@metamask/network-controller` from `^24.0.0` to `^25.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))
- Bump `@metamask/base-controller` from `^8.4.2` to `^9.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))

## [1.0.2]

### Changed

- Bump `@metamask/base-controller` from `^8.4.1` to `^8.4.2` ([#6917](https://github.com/MetaMask/core/pull/6917))
- Bump `@metamask/network-controller` from `^24.2.2` to `^24.3.0` ([#6883](https://github.com/MetaMask/core/pull/6883))

## [1.0.1]

### Changed

- Bump `@metamask/utils` from `^11.8.0` to `^11.8.1` ([#6708](https://github.com/MetaMask/core/pull/6708))
- Bump `@metamask/base-controller` from `^8.4.0` to `^8.4.1` ([#6807](https://github.com/MetaMask/core/pull/6807))
- Bump `@metamask/controller-utils` from `^11.14.0` to `^11.14.1` ([#6807](https://github.com/MetaMask/core/pull/6807))

## [1.0.0]

### Added

- Add two new controller state metadata properties: `includeInStateLogs` and `usedInUi` ([#6525](https://github.com/MetaMask/core/pull/6525))
- Add Solana Devnet support to multichain network controller ([#6670](https://github.com/MetaMask/core/pull/6670))

### Changed

- Bump package version to v1.0 to mark stabilization ([#6676](https://github.com/MetaMask/core/pull/6676))
- Bump `@metamask/controller-utils` from `^11.12.0` to `^11.14.0` ([#6620](https://github.com/MetaMask/core/pull/6620), [#6629](https://github.com/MetaMask/core/pull/6629))
- Bump `@metamask/base-controller` from `^8.1.0` to `^8.4.0` ([#6355](https://github.com/MetaMask/core/pull/6355), [#6465](https://github.com/MetaMask/core/pull/6465), [#6632](https://github.com/MetaMask/core/pull/6632))
- Bump `@metamask/keyring-api` from `^20.1.0` to `^21.0.0` ([#6560](https://github.com/MetaMask/core/pull/6560))
- Bump `@metamask/keyring-internal-api` from `^8.1.0` to `^9.0.0` ([#6560](https://github.com/MetaMask/core/pull/6560))
- Bump `@metamask/utils` from `^11.4.2` to `^11.8.0` ([#6588](https://github.com/MetaMask/core/pull/6588))

## [0.12.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` from `^32.0.0` to `^33.0.0` ([#6345](https://github.com/MetaMask/core/pull/6345))
- Bump `@metamask/base-controller` from `^8.0.1` to `^8.1.0` ([#6284](https://github.com/MetaMask/core/pull/6284))
- Bump `@metamask/controller-utils` from `^11.11.0` to `^11.12.0` ([#6303](https://github.com/MetaMask/core/pull/6303))
- Bump accounts related packages ([#6309](https://github.com/MetaMask/core/pull/6309))
  - Bump `@metamask/keyring-api` from `^20.0.0` to `^20.1.0`
  - Bump `@metamask/keyring-internal-api` from `^8.0.0` to `^8.1.0`

## [0.11.1]

### Changed

- Bump `@metamask/keyring-api` from `^19.0.0` to `^20.0.0` ([#6248](https://github.com/MetaMask/core/pull/6248))
- Bump `@metamask/keyring-internal-api` from `^7.0.0` to `^8.0.0` ([#6248](https://github.com/MetaMask/core/pull/6248))

## [0.11.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` from `^31.0.0` to `^32.0.0` ([#6171](https://github.com/MetaMask/core/pull/6171))
- Bump `@metamask/keyring-api` from `^18.0.0` to `^19.0.0` ([#6146](https://github.com/MetaMask/core/pull/6146))
- Bump `@metamask/keyring-internal-api` from `^6.2.0` to `^7.0.0` ([#6146](https://github.com/MetaMask/core/pull/6146))

## [0.10.0]

### Changed

- Bump `@metamask/controller-utils` from `^11.10.0` to `^11.11.0` ([#6069](https://github.com/MetaMask/core/pull/6069))
- Bump `@metamask/utils` from `^11.2.0` to `^11.4.2` ([#6054](https://github.com/MetaMask/core/pull/6054))

### Fixed

- Use `scopes` instead of `address` to retrieve the network of an account. ([#6072](https://github.com/MetaMask/core/pull/6072))

## [0.9.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` to `^31.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))
- **BREAKING:** Bump peer dependency `@metamask/network-controller` to `^24.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))
- Bump `@metamask/controller-utils` to `^11.10.0` ([#5935](https://github.com/MetaMask/core/pull/5935))

## [0.8.0]

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency to `^30.0.0` ([#5888](https://github.com/MetaMask/core/pull/5888))
- Bump `@metamask/keyring-api` dependency from `^17.4.0` to `^18.0.0` ([#5871](https://github.com/MetaMask/core/pull/5871))
- Bump `@metamask/keyring-internal-api` dependency from `^6.0.1` to `^6.2.0` ([#5871](https://github.com/MetaMask/core/pull/5871))
- Bump `@metamask/controller-utils` to `^11.9.0` ([#5812](https://github.com/MetaMask/core/pull/5812))

## [0.7.0]

### Changed

- **BREAKING:** bump `@metamask/accounts-controller` peer dependency to `^29.0.0` ([#5802](https://github.com/MetaMask/core/pull/5802))
- Bump `@metamask/controller-utils` to `^11.8.0` ([#5765](https://github.com/MetaMask/core/pull/5765))

## [0.6.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` to `^28.0.0` ([#5763](https://github.com/MetaMask/core/pull/5763))
- Bump `@metamask/base-controller` from ^8.0.0 to ^8.0.1 ([#5722](https://github.com/MetaMask/core/pull/5722))

## [0.5.1]

### Changed

- Updated to restrict `getNetworksWithTransactionActivityByAccounts` to EVM networks only while non-EVM network endpoint support is being completed. Full multi-chain support will be restored in the coming weeks ([#5677](https://github.com/MetaMask/core/pull/5677))
- Updated network activity API requests to have batching support to handle URL length limitations, allowing the controller to fetch network activity for any number of accounts ([#5752](https://github.com/MetaMask/core/pull/5752))

## [0.5.0]

### Added

- Add method `getNetworksWithTransactionActivityByAccounts` to fetch active networks for multiple accounts in a single request ([#5551](https://github.com/MetaMask/core/pull/5551))
- Add `MultichainNetworkService` for handling network activity fetching ([#5551](https://github.com/MetaMask/core/pull/5551))
- Add types for network activity state and responses ([#5551](https://github.com/MetaMask/core/pull/5551))

### Changed

- Updated state management for network activity ([#5551](https://github.com/MetaMask/core/pull/5551))

## [0.4.0]

### Added

- Add Testnet asset IDs as constants ([#5589](https://github.com/MetaMask/core/pull/5589))
- Add Network specific decimal values and ticker as constants ([#5589](https://github.com/MetaMask/core/pull/5589))
- Add new method `removeNetwork` that acts as a proxy to remove an EVM network from the `@metamask/network-controller` ([#5516](https://github.com/MetaMask/core/pull/5516))

### Changed

- The `AVAILABLE_MULTICHAIN_NETWORK_CONFIGURATIONS` now includes non-EVM testnets ([#5589](https://github.com/MetaMask/core/pull/5589))
- Bump `@metamask/keyring-api"` from `^17.2.0` to `^17.4.0` ([#5565](https://github.com/MetaMask/core/pull/5565))

### Fixed

- Fix the condition to update the active network based on the `AccountsController:selectedAccountChange` event ([#5642](https://github.com/MetaMask/core/pull/5642))

## [0.3.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` to `^27.0.0` ([#5507](https://github.com/MetaMask/core/pull/5507))
- **BREAKING:** Bump peer dependency `@metamask/network-controller` to `^23.0.0` ([#5507](https://github.com/MetaMask/core/pull/5507))

## [0.2.0]

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency to `^26.0.0` ([#5439](https://github.com/MetaMask/core/pull/5439))
- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency to `^25.0.0` ([#5426](https://github.com/MetaMask/core/pull/5426))

## [0.1.2]

### Changed

- Bump `@metamask/keyring-api"` from `^17.0.0` to `^17.2.0` ([#5366](https://github.com/MetaMask/core/pull/5366))
- Bump `@metamask/utils` from `^11.1.0` to `^11.2.0` ([#5301](https://github.com/MetaMask/core/pull/5301))

## [0.1.1]

### Fixed

- Add `MultichainNetworkController:stateChange` to list of subscribable `MultichainNetworkController` messenger events ([#5331](https://github.com/MetaMask/core/pull/5331))

## [0.1.0]

### Added

- Initial release ([#5215](https://github.com/MetaMask/core/pull/5215))
  - Handle both EVM and non-EVM network and account switching for the associated network.
  - Act as a proxy for the `NetworkController` (for EVM network changes).

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@3.0.6...HEAD
[3.0.6]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@3.0.5...@metamask/multichain-network-controller@3.0.6
[3.0.5]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@3.0.4...@metamask/multichain-network-controller@3.0.5
[3.0.4]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@3.0.3...@metamask/multichain-network-controller@3.0.4
[3.0.3]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@3.0.2...@metamask/multichain-network-controller@3.0.3
[3.0.2]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@3.0.1...@metamask/multichain-network-controller@3.0.2
[3.0.1]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@3.0.0...@metamask/multichain-network-controller@3.0.1
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@2.0.0...@metamask/multichain-network-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@1.0.2...@metamask/multichain-network-controller@2.0.0
[1.0.2]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@1.0.1...@metamask/multichain-network-controller@1.0.2
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@1.0.0...@metamask/multichain-network-controller@1.0.1
[1.0.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@0.12.0...@metamask/multichain-network-controller@1.0.0
[0.12.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@0.11.1...@metamask/multichain-network-controller@0.12.0
[0.11.1]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@0.11.0...@metamask/multichain-network-controller@0.11.1
[0.11.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@0.10.0...@metamask/multichain-network-controller@0.11.0
[0.10.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@0.9.0...@metamask/multichain-network-controller@0.10.0
[0.9.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@0.8.0...@metamask/multichain-network-controller@0.9.0
[0.8.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@0.7.0...@metamask/multichain-network-controller@0.8.0
[0.7.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@0.6.0...@metamask/multichain-network-controller@0.7.0
[0.6.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@0.5.1...@metamask/multichain-network-controller@0.6.0
[0.5.1]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@0.5.0...@metamask/multichain-network-controller@0.5.1
[0.5.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@0.4.0...@metamask/multichain-network-controller@0.5.0
[0.4.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@0.3.0...@metamask/multichain-network-controller@0.4.0
[0.3.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@0.2.0...@metamask/multichain-network-controller@0.3.0
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@0.1.2...@metamask/multichain-network-controller@0.2.0
[0.1.2]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@0.1.1...@metamask/multichain-network-controller@0.1.2
[0.1.1]: https://github.com/MetaMask/core/compare/@metamask/multichain-network-controller@0.1.0...@metamask/multichain-network-controller@0.1.1
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/multichain-network-controller@0.1.0
