# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Deprecated

- Deprecate preference `smartAccountOptInForAccounts` and function `setSmartAccountOptInForAccounts` ([#6087](https://github.com/MetaMask/core/pull/6087))

## [18.4.1]

### Changed

- Bump `@metamask/controller-utils` from `^11.10.0` to `^11.11.0` ([#6069](https://github.com/MetaMask/core/pull/6069))
  - This upgrade includes performance improvements to checksum hex address normalization

## [18.4.0]

### Changed

- Initialise preference smartAccountOptIn with true value ([#6040](https://github.com/MetaMask/core/pull/6040))

## [18.3.0]

### Added

- Add `smartAccountOptIn`, `smartAccountOptInForAccounts` preferences ([#6036](https://github.com/MetaMask/core/pull/6036))

## [18.2.0]

### Added

- Add support for SEI (chain ID `0x531`) ([#6021](https://github.com/MetaMask/core/pull/6021))
  - Add `SEI` into constant `ETHERSCAN_SUPPORTED_CHAIN_IDS`
  - Update default controller state so SEI (Chain ID `0xe705`) is automatically enabled in `showIncomingTransactions`

### Changed

- Bump `@metamask/controller-utils` to `^11.10.0` ([#5935](https://github.com/MetaMask/core/pull/5935))

## [18.1.0]

### Added

- Add `dismissSmartAccountSuggestionEnabled` preference ([#5866](https://github.com/MetaMask/core/pull/5866))

### Changed

- Bump `@metamask/controller-utils` to `^11.9.0` ([#5812](https://github.com/MetaMask/core/pull/5812))

## [18.0.0]

### Changed

- **BREAKING:** bump `@metamask/keyring-controller` peer dependency to `^22.0.0` ([#5802](https://github.com/MetaMask/core/pull/5802))
- Bump `@metamask/base-controller` from ^8.0.0 to ^8.0.1 ([#5722](https://github.com/MetaMask/core/pull/5722))
- Bump `@metamask/controller-utils` to `^11.8.0` ([#5765](https://github.com/MetaMask/core/pull/5765))

## [17.0.0]

### Changed

- **BREAKING:** Bump `@metamask/keyring-controller` peer dependency to `^21.0.0` ([#5439](https://github.com/MetaMask/core/pull/5439))

## [16.0.0]

### Changed

- **BREAKING:** Bump `@metamask/keyring-controller` peer dependency to `^20.0.0` ([#5426](https://github.com/MetaMask/core/pull/5426))

## [15.0.2]

### Changed

- Bump `@metamask/base-controller` from `^7.0.2` to `^8.0.0` ([#5079](https://github.com/MetaMask/core/pull/5079)), ([#5135](https://github.com/MetaMask/core/pull/5135)), ([#5305](https://github.com/MetaMask/core/pull/5305))
- Bump `@metamask/controller-utils` from `^11.4.4` to `^11.5.0` ([#5135](https://github.com/MetaMask/core/pull/5135)), ([#5272](https://github.com/MetaMask/core/pull/5272))

## [15.0.1]

### Changed

- Bump `@metamask/controller-utils` from `^11.4.3` to `^11.4.4` ([#5012](https://github.com/MetaMask/core/pull/5012))

## [15.0.0]

### Changed

- **BREAKING:** Bump `@metamask/keyring-controller` peer dependency from `^18.0.0` to `^19.0.0` ([#4195](https://github.com/MetaMask/core/pull/4956))

## [14.0.0]

### Changed

- **BREAKING:** Bump `@metamask/keyring-controller` peer dependency from `^17.0.0` to `^18.0.0` ([#4915](https://github.com/MetaMask/core/pull/4915))
- Bump `@metamask/controller-utils` from `^11.4.2` to `^11.4.3` ([#4915](https://github.com/MetaMask/core/pull/4915))

## [13.3.0]

### Changed

- Enable smart transactions by default for new users ([#4885](https://github.com/MetaMask/core/pull/4885))

## [13.2.0]

### Added

- Add `useSafeChainsListValidation` preference ([#4860](https://github.com/MetaMask/core/pull/4860))
  - Add `useSafeChainsListValidation` property to the `PreferencesController` state (default: `true`)
  - Add `setUseSafeChainsListValidation` method to set this property
- Add `tokenSortConfig` preference ([#4860](https://github.com/MetaMask/core/pull/4860))
  - Add `tokenSortConfig` property to the `PreferencesController` state (default value: `{ key: 'tokenFiatAmount', order: 'dsc', sortCallback: 'stringNumeric' }`)
  - Add `setTokenSortConfig` method to set this property
- Add `privacyMode` preference ([#4860](https://github.com/MetaMask/core/pull/4860))
  - Add `privacyMode` property to the `PreferencesController` state (default value: `false`)
  - Add `setPrivacyMode` method to set this property
- Add `useMultiRpcMigration` preference ([#4732](https://github.com/MetaMask/core/pull/4732))

### Changed

- Bump `@metamask/base-controller` from `^7.0.1` to `^7.0.2` ([#4862](https://github.com/MetaMask/core/pull/4862))
- Bump `@metamask/controller-utils` from `^11.3.0` to `^11.4.2` ([#4834](https://github.com/MetaMask/core/pull/4834), [#4862](https://github.com/MetaMask/core/pull/4862), [#4870](https://github.com/MetaMask/core/pull/4870))

## [13.1.0]

### Changed

- Bump `@metamask/keyring-controller` from `^17.2.1` to `^17.2.2` ([#4734](https://github.com/MetaMask/core/pull/4734))

## [13.0.3]

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

## [13.0.2]

### Changed

- Bump `@metamask/base-controller` from `^6.0.2` to `^7.0.0` ([#4625](https://github.com/MetaMask/core/pull/4625), [#4643](https://github.com/MetaMask/core/pull/4643))
- Bump `@metamask/controller-utils` from `^11.0.2` to `^11.2.0` ([#4639](https://github.com/MetaMask/core/pull/4639), [#4651](https://github.com/MetaMask/core/pull/4651))
- Bump `typescript` from `~5.0.4` to `~5.2.2` ([#4576](https://github.com/MetaMask/core/pull/4576), [#4584](https://github.com/MetaMask/core/pull/4584))

## [13.0.1]

### Changed

- Upgrade TypeScript version to `~5.0.4` and set `moduleResolution` option to `Node16` ([#3645](https://github.com/MetaMask/core/pull/3645))
- Bump `@metamask/base-controller` from `^6.0.0` to `^6.0.2` ([#4517](https://github.com/MetaMask/core/pull/4517), [#4544](https://github.com/MetaMask/core/pull/4544))
- Bump `@metamask/controller-utils` from `^11.0.0` to `^11.0.2` ([#4517](https://github.com/MetaMask/core/pull/4517), [#4544](https://github.com/MetaMask/core/pull/4544))

## [13.0.0]

### Changed

- **BREAKING:** Bump minimum Node version to 18.18 ([#3611](https://github.com/MetaMask/core/pull/3611))
- **BREAKING:** Bump peer dependency `@metamask/keyring-controller` to `^17.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- Bump `@metamask/base-controller` to `^6.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- Bump `@metamask/controller-utils` to `^11.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))

## [12.0.0]

### Added

- Add `smartTransactionsOptInStatus` preference ([#3815](https://github.com/MetaMask/core/pull/3815))
  - Add `smartTransactionsOptInStatus` property to the `PreferencesController` state (default: `false`)
  - Add `setSmartTransactionOptInStatus` method to set this property
- Add `useTransactionSimulations` preference ([#4283](https://github.com/MetaMask/core/pull/4283))
  - Add `useTransactionSimulations` property to the `PreferencesController` state (default value: `false`)
  - Add `setUseTransactionSimulations` method to set this property

### Changed

- Bump `@metamask/controller-utils` to `^10.0.0` ([#4342](https://github.com/MetaMask/core/pull/4342))

### Removed

- **BREAKING:** Remove state property `disabledRpcMethodPreferences` along with `setDisabledRpcMethodPreferences` method ([#4319](https://github.com/MetaMask/core/pull/4319))
  - These were for disabling the `eth_sign` RPC method, but support for this method is being removed, so this preference is no longer needed.

## [11.0.0]

### Added

- Export `ETHERSCAN_SUPPORTED_CHAIN_IDS` constant ([#4233](https://github.com/MetaMask/core/pull/4233))

### Changed

- **BREAKING** Bump `@metamask/keyring-controller` peer dependency to ^16.0.0 ([#4234](https://github.com/MetaMask/core/pull/4234))
- Bump `@metamask/base-controller` to `^5.0.2` ([#4232](https://github.com/MetaMask/core/pull/4232))

## [10.0.0]

### Changed

- **BREAKING** Bump peer dependency on `@metamask/keyring-controller` to `^15.0.0` ([#4090](https://github.com/MetaMask/core/pull/4090))
- Restore previous behavior of toChecksumHexAddress ([#4046](https://github.com/MetaMask/core/pull/4046))

## [9.0.1]

### Fixed

- Fix `types` field in `package.json` ([#4047](https://github.com/MetaMask/core/pull/4047))

## [9.0.0]

### Added

- **BREAKING**: Add ESM build ([#3998](https://github.com/MetaMask/core/pull/3998))
  - It's no longer possible to import files from `./dist` directly.
- Add support for Linea Sepolia (chain ID `0xe705`) ([#3995](https://github.com/MetaMask/core/pull/3995))
  - Update default controller state so `0xe705` is automatically enabled in `showIncomingTransactions`.

### Changed

- **BREAKING:** Bump `@metamask/base-controller` to `^5.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
  - This version has a number of breaking changes. See the changelog for more.
- **BREAKING:** Bump peer dependency on `@metamask/keyring-controller` to `^14.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
- Bump `@metamask/controller-utils` to `^9.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))

## [8.0.0]

### Changed

- **BREAKING:** Bump `@metamask/keyring-controller` dependency and peer dependency to `^13.0.0` ([#4007](https://github.com/MetaMask/core/pull/4007))
- **BREAKING:** Remove support for Optimism Goerli, add support for Optimism Sepolia ([#3999](https://github.com/MetaMask/core/pull/3999))
  - Replace `OPTIMISM_TESTNET` with `OPTIMISM_SEPOLIA` in `ETHERSCAN_SUPPORTED_CHAIN_IDS` and `EtherscanSupportedChains`.
  - Replace `0x1a4` with `0xaa37dc` in `EtherscanSupportedHexChainId`.
  - Replace `0x1a4` with `0xaa37dc` in default `showIncomingTransactions` state.
  - Update `setEnabledNetworkIncomingTransactions` to ignore a chain ID of `0x1a4`; add support for `0xaa37dc` instead.
  - You will likely want to write a migration to transfer the value of `0x1a4` for `0xaa37dc` for the `showIncomingTransactions` state property.
- Bump `@metamask/controller-utils` to `^8.0.4` ([#4007](https://github.com/MetaMask/core/pull/4007))

### Removed

- **BREAKING:** Move `syncIdentities` to private, as it's only used internally to update state on `KeyringController:stateChange` event ([#3976](https://github.com/MetaMask/core/pull/3976))
- **BREAKING:** Remove `updateIdentities`, as it's not in use anymore ([#3976](https://github.com/MetaMask/core/pull/3976))

### Fixed

- Fix KeyringController state listener to not sync identities when the wallet is locked (which clears the list of accounts) to avoid setting the selected address to `undefined` ([#3946](https://github.com/MetaMask/core/pull/3946))

## [7.0.0]

### Changed

- **BREAKING:** Keep `PreferencesController` state synchronized with `KeyringController` state ([#3799](https://github.com/MetaMask/core/pull/3799))
  - The `KeyringController:stateChange` event is now required by the `PreferencesController` messenger, which is a breaking change.
  - The package `@metamask/keyring-controller` has been added as a `peerDependency` and as a `devDependency`, which is a breaking change.
  - Previously the state was synchronized manually by calling `syncIdentities` or `updateIdentities`. Calling these methods is no longer required.
- Bump `@metamask/base-controller` to `^4.1.1` ([#3760](https://github.com/MetaMask/core/pull/3760), [#3821](https://github.com/MetaMask/core/pull/3821))
- Bump `@metamask/controller-utils` to `^8.0.2` ([#3821](https://github.com/MetaMask/core/pull/3821))

## [6.0.0]

### Added

- Added `getDefaultPreferencesState` function ([#3736](https://github.com/MetaMask/core/pull/3736))

### Changed

- **BREAKING** Clean up types ([#3712](https://github.com/MetaMask/core/pull/3712))
  - Replace `ContactEntry` interface with `Identity` type
  - Convert `PreferencesState` from an interface to a type
- **BREAKING:** Convert to `BaseControllerV2` ([#3713](https://github.com/MetaMask/core/pull/3713))
  - The constructor parameters have changed; rather than accepting an empty "config" parameter and a "state" parameter, there is now just a single object for all constructor arguments. This object has a mandatory `messenger` and an optional `state` property.
  - Additional type exports have been added for the controller messenger and associated types

## [5.0.1]

### Changed

- Bump `@metamask/base-controller` to `^4.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695))
- Bump `@metamask/controller-utils` to `^8.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695), [#3678](https://github.com/MetaMask/core/pull/3678), [#3667](https://github.com/MetaMask/core/pull/3667), [#3580](https://github.com/MetaMask/core/pull/3580))

## [5.0.0]

### Added

- **BREAKING** Add required property `showIncomingTransactions` to `PreferencesState` ([#1659](https://github.com/MetaMask/core/pull/1659))
- Add types `EtherscanSupportedChains`, `EtherscanSupportedHexChainId` ([#1659](https://github.com/MetaMask/core/pull/1659))
- Add constant `ETHERSCAN_SUPPORTED_CHAIN_IDS` ([#1659](https://github.com/MetaMask/core/pull/1659))
- Add `setEnabledNetworkIncomingTransactions` method ([#1659](https://github.com/MetaMask/core/pull/1659))
  - This can be used to set the `showIncomingTransactions` preference for the given chain ID.

### Changed

- Bump `@metamask/base-controller` to ^4.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
  - This is not breaking because this controller still inherits from BaseController v1.
- Bump `@metamask/controller-utils` to ^6.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))

## [4.4.3]

### Changed

- Bump dependency on `@metamask/base-controller` to ^3.2.3 ([#1747](https://github.com/MetaMask/core/pull/1747))
- Bump dependency on `@metamask/controller-utils` to ^5.0.2 ([#1747](https://github.com/MetaMask/core/pull/1747))

## [4.4.2]

### Changed

- Update TypeScript to v4.8.x ([#1718](https://github.com/MetaMask/core/pull/1718))

## [4.4.1]

### Changed

- Bump dependency on `@metamask/controller-utils` to ^5.0.0

## [4.4.0]

### Added

- Add `isIpfsGatewayEnabled` property to PreferencesController state ([#1577](https://github.com/MetaMask/core/pull/1577))
- Add `setIsIpfsGatewayEnabled` to set `isIpfsGatewayEnabled` ([#1577](https://github.com/MetaMask/core/pull/1577))

### Changed

- Bump dependency on `@metamask/base-controller` to ^3.2.1
- Bump dependency on `@metamask/controller-utils` to ^4.3.2

## [4.3.0]

### Added

- Add preference for security alerts ([#1589](https://github.com/MetaMask/core/pull/1589))

## [4.2.0]

### Added

- Add controller state property `showTestNetworks` along with a setter method, `setShowTestNetworks` ([#1418](https://github.com/MetaMask/core/pull/1418))

## [4.1.0]

### Added

- Add `isMultiAccountBalancesEnabled` to state (default: true) along with a `setIsMultiAccountBalancesEnabled` method to set it

## [4.0.0]

### Changed

- **BREAKING:** Bump to Node 16 ([#1262](https://github.com/MetaMask/core/pull/1262))

## [3.0.0]

### Changed

- **BREAKING:** Migrate network configurations from `PreferencesController` to `NetworkController` ([#1064](https://github.com/MetaMask/core/pull/1064))
  - Consumers will need to adapt by reading network data from `NetworkConfigurations` state on `NetworkController` rather than `frequentRpcList` on `PreferencesController`. See `NetworkController` v6.0.0 changelog entry for more details.

## [2.1.0]

### Added

- `disabledRpcMethodPreferences` state to PreferencesController ([#1109](https://github.com/MetaMask/core/pull/1109)). See [this PR on extension](https://github.com/MetaMask/metamask-extension/pull/17308) and [this ticket](https://github.com/MetaMask/metamask-mobile/issues/5676)

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

    - `src/user/PreferencesController.ts` (plus `ContactEntry` copied from `src/user/AddressBookController.ts`)
    - `src/user/PreferencesController.test.ts`

    All changes listed after this point were applied to this package following the monorepo conversion.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@18.4.1...HEAD
[18.4.1]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@18.4.0...@metamask/preferences-controller@18.4.1
[18.4.0]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@18.3.0...@metamask/preferences-controller@18.4.0
[18.3.0]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@18.2.0...@metamask/preferences-controller@18.3.0
[18.2.0]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@18.1.0...@metamask/preferences-controller@18.2.0
[18.1.0]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@18.0.0...@metamask/preferences-controller@18.1.0
[18.0.0]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@17.0.0...@metamask/preferences-controller@18.0.0
[17.0.0]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@16.0.0...@metamask/preferences-controller@17.0.0
[16.0.0]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@15.0.2...@metamask/preferences-controller@16.0.0
[15.0.2]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@15.0.1...@metamask/preferences-controller@15.0.2
[15.0.1]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@15.0.0...@metamask/preferences-controller@15.0.1
[15.0.0]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@14.0.0...@metamask/preferences-controller@15.0.0
[14.0.0]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@13.3.0...@metamask/preferences-controller@14.0.0
[13.3.0]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@13.2.0...@metamask/preferences-controller@13.3.0
[13.2.0]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@13.1.0...@metamask/preferences-controller@13.2.0
[13.1.0]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@13.0.3...@metamask/preferences-controller@13.1.0
[13.0.3]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@13.0.2...@metamask/preferences-controller@13.0.3
[13.0.2]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@13.0.1...@metamask/preferences-controller@13.0.2
[13.0.1]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@13.0.0...@metamask/preferences-controller@13.0.1
[13.0.0]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@12.0.0...@metamask/preferences-controller@13.0.0
[12.0.0]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@11.0.0...@metamask/preferences-controller@12.0.0
[11.0.0]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@10.0.0...@metamask/preferences-controller@11.0.0
[10.0.0]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@9.0.1...@metamask/preferences-controller@10.0.0
[9.0.1]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@9.0.0...@metamask/preferences-controller@9.0.1
[9.0.0]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@8.0.0...@metamask/preferences-controller@9.0.0
[8.0.0]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@7.0.0...@metamask/preferences-controller@8.0.0
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@6.0.0...@metamask/preferences-controller@7.0.0
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@5.0.1...@metamask/preferences-controller@6.0.0
[5.0.1]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@5.0.0...@metamask/preferences-controller@5.0.1
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@4.4.3...@metamask/preferences-controller@5.0.0
[4.4.3]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@4.4.2...@metamask/preferences-controller@4.4.3
[4.4.2]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@4.4.1...@metamask/preferences-controller@4.4.2
[4.4.1]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@4.4.0...@metamask/preferences-controller@4.4.1
[4.4.0]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@4.3.0...@metamask/preferences-controller@4.4.0
[4.3.0]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@4.2.0...@metamask/preferences-controller@4.3.0
[4.2.0]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@4.1.0...@metamask/preferences-controller@4.2.0
[4.1.0]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@4.0.0...@metamask/preferences-controller@4.1.0
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@3.0.0...@metamask/preferences-controller@4.0.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@2.1.0...@metamask/preferences-controller@3.0.0
[2.1.0]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@2.0.0...@metamask/preferences-controller@2.1.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@1.0.2...@metamask/preferences-controller@2.0.0
[1.0.2]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@1.0.1...@metamask/preferences-controller@1.0.2
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@1.0.0...@metamask/preferences-controller@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/preferences-controller@1.0.0
