# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Stop updating `selectedAccount` unnecesarily ([#6218](https://github.com/MetaMask/core/pull/6218))

## [32.0.1]

### Fixed

- Allow extra `options` properties when detecting BIP-44 Snap account ([#6189](https://github.com/MetaMask/core/pull/6189))

## [32.0.0]

### Added

- Use new typed `KeyringAccount.options` for BIP-44 compatible accounts ([#6122](https://github.com/MetaMask/core/pull/6122)), ([#6147](https://github.com/MetaMask/core/pull/6147))

### Changed

- **BREAKING:** Bump peer dependency `@metamask/snaps-controllers` from `^12.0.0` to `^14.0.0` ([#6035](https://github.com/MetaMask/core/pull/6035))
- Bump `@metamask/snaps-sdk` from `^7.1.0` to `^9.0.0` ([#6035](https://github.com/MetaMask/core/pull/6035))
- Bump `@metamask/snaps-utils` from `^9.4.0` to `^11.0.0` ([#6035](https://github.com/MetaMask/core/pull/6035))
- Bump `@metamask/keyring-api` from `^18.0.0` to `^19.0.0` ([#6146](https://github.com/MetaMask/core/pull/6146))
- Bump `@metamask/keyring-internal-api` from `^6.2.0` to `^7.0.0` ([#6146](https://github.com/MetaMask/core/pull/6146))
- Bump `@metamask/keyring-utils` from `^3.0.0` to `^3.1.0` ([#6146](https://github.com/MetaMask/core/pull/6146))
- Bump `@metamask/eth-snap-keyring` from `^13.0.0` to `^14.0.0` ([#6146](https://github.com/MetaMask/core/pull/6146))
- Bump `@metamask/utils` from `^11.2.0` to `^11.4.2` ([#6054](https://github.com/MetaMask/core/pull/6054))

## [31.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/network-controller` to `^24.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))

## [30.0.0]

### Changed

- **BREAKING:** Bump `@metamask/providers` peer dependency from `^21.0.0` to `^22.0.0` ([#5871](https://github.com/MetaMask/core/pull/5871))
- **BREAKING:** Bump `@metamask/snaps-controllers` peer dependency from `^11.0.0` to `^12.0.0` ([#5871](https://github.com/MetaMask/core/pull/5871))

## [29.0.1]

### Fixed

- Prevent use of `undefined` Snap during `SnapController:stateChange` ([#5884](https://github.com/MetaMask/core/pull/5884))
  - We were assuming that the Snap will always be defined, but this might not always be true.
- Populate `.options.entropySource` for new `InternalAccount`s before publishing `:accountAdded` ([#5841](https://github.com/MetaMask/core/pull/5841))

## [29.0.0]

### Changed

- **BREAKING:** bump `@metamask/keyring-controller` peer dependency to `^22.0.0` ([#5802](https://github.com/MetaMask/core/pull/5802))

## [28.0.0]

### Added

- Add new `setAccountNameAndSelectAccount` action ([#5714](https://github.com/MetaMask/core/pull/5714))
- Add `entropySource` and `derivationPath` to EVM HD account options ([#5618](https://github.com/MetaMask/core/pull/5618))

### Changed

- **BREAKING:** Bump `@metamask/snaps-controllers` peer dependency from `^9.19.0` to `^11.0.0` ([#5639](https://github.com/MetaMask/core/pull/5639))
- **BREAKING:** Bump `@metamask/providers` peer dependency from `^18.1.0` to `^21.0.0` ([#5639](https://github.com/MetaMask/core/pull/5639))
- Bump `@metamask/base-controller` from `^8.0.0` to `^8.0.1` ([#5722](https://github.com/MetaMask/core/pull/5722))
- Bump `@metamask/snaps-sdk` from `^6.17.1` to `^6.22.0` ([#5639](https://github.com/MetaMask/core/pull/5639))
- Bump `@metamask/snaps-utils` from `^8.10.0` to `^9.2.0` ([#5639](https://github.com/MetaMask/core/pull/5639))
- Bump `@metamask/eth-snap-keyring` from `^12.0.0` to `^12.1.1` ([#5565](https://github.com/MetaMask/core/pull/5565))
- Bump `@metamask/keyring-api` from `^17.2.0` to `^17.4.0` ([#5565](https://github.com/MetaMask/core/pull/5565))
- Bump `@metamask/keyring-internal-api` from `^6.0.0` to `^6.0.1` ([#5565](https://github.com/MetaMask/core/pull/5565))

### Fixed

- Do not fire events during `update` blocks ([#5555](https://github.com/MetaMask/core/pull/5555))
- Prevent unnecessary state updates when updating `InternalAccount.metadata.snap` ([#5735](https://github.com/MetaMask/core/pull/5735))

## [27.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/network-controller` to `^23.0.0` ([#5507](https://github.com/MetaMask/core/pull/5507))

### Fixed

- `@metamask/network-controller` peer dependency is no longer also a direct dependency ([#5464](https://github.com/MetaMask/core/pull/5464)))

## [26.1.0]

### Changed

- Simplify account iteration logic ([#5445](https://github.com/MetaMask/core/pull/5445))

## [26.0.0]

### Changed

- **BREAKING:** Bump `@metamask/keyring-controller` peer dependency to `^21.0.0` ([#5439](https://github.com/MetaMask/core/pull/5439))
- **BREAKING:** Bump `@metamask/keyring-utils` from `^2.3.1` to `^3.0.0` ([#5347](https://github.com/MetaMask/core/pull/5347))
- **BREAKING:** Bump `@metamask/keyring-internal-api` from `^5.0.0` to `^6.0.0` ([#5347](https://github.com/MetaMask/core/pull/5347))
- **BREAKING:** Bump `@metamask/eth-snap-keyring` from `^11.1.0` to `^12.0.0` ([#5347](https://github.com/MetaMask/core/pull/5347))
- **BREAKING:** Bump `@ethereumjs/util` from `^8.1.0` to `^9.1.0` ([#5347](https://github.com/MetaMask/core/pull/5347))

## [25.0.0]

### Changed

- **BREAKING:** Bump `@metamask/keyring-controller` peer dependency to `^20.0.0` ([#5426](https://github.com/MetaMask/core/pull/5426))
- Bump `@metamask/keyring-internal-api` from `^4.0.3` to `^5.0.0` ([#5405](https://github.com/MetaMask/core/pull/5405))

## [24.1.0]

### Changed

- Use `account.scopes` in `listMultichainAccounts` ([#5388](https://github.com/MetaMask/core/pull/5388))
  - The previous logic was fragile and was relying on the account's type mainly.

## [24.0.1]

### Changed

- Bump `@metamask/keyring-controller"` from `^19.1.0` to `^19.2.0` ([#5357](https://github.com/MetaMask/core/pull/5357))
- Bump `@metamask/keyring-api"` from `^17.0.0` to `^17.2.0` ([#5366](https://github.com/MetaMask/core/pull/5366))
- Bump `@metamask/keyring-internal-api` from `^4.0.1` to `^4.0.3` ([#5356](https://github.com/MetaMask/core/pull/5356)), ([#5366](https://github.com/MetaMask/core/pull/5366))
- Bump `@metamask/eth-snap-keyring` from `^10.0.0` to `^11.1.0` ([#5366](https://github.com/MetaMask/core/pull/5366))
- Bump `@metamask/utils` from `^11.1.0` to `^11.2.0` ([#5301](https://github.com/MetaMask/core/pull/5301))

## [24.0.0]

### Added

- **BREAKING:** Now requires `MultichainNetworkController:didNetworkChange` event to be registered on the messenger ([#5215](https://github.com/MetaMask/core/pull/5215))
  - This will be used to keep accounts in sync with EVM and non-EVM network changes.

### Changed

- **BREAKING:** Add `@metamask/network-controller@^22.0.0` peer dependency ([#5215](https://github.com/MetaMask/core/pull/5215)), ([#5327](https://github.com/MetaMask/core/pull/5327))

## [23.1.0]

### Added

- Add new keyring type for OneKey ([#5216](https://github.com/MetaMask/core/pull/5216))

## [23.0.1]

### Changed

- Bump `@metamask/base-controller` from `^7.1.1` to `^8.0.0` ([#5305](https://github.com/MetaMask/core/pull/5305))

## [23.0.0]

### Changed

- **BREAKING:** Bump `@metamask/snaps-controllers` peer dependency from `^9.7.0` to `^9.19.0` ([#5265](https://github.com/MetaMask/core/pull/5265))
- Bump `@metamask/keyring-api"` from `^16.1.0` to `^17.0.0` ([#5280](https://github.com/MetaMask/core/pull/5280))
- Bump `@metamask/eth-snap-keyring` from `^9.1.1` to `^10.0.0` ([#5280](https://github.com/MetaMask/core/pull/5280))
- Bump `@metamask/snaps-sdk` from `^6.7.0` to `^6.17.1` ([#5220](https://github.com/MetaMask/core/pull/5220)), ([#5265](https://github.com/MetaMask/core/pull/5265))
- Bump `@metamask/snaps-utils` from `^8.9.0` to `^8.10.0` ([#5265](https://github.com/MetaMask/core/pull/5265))
- Bump `@metamask/utils` from `^11.0.1` to `^11.1.0` ([#5223](https://github.com/MetaMask/core/pull/5223))

### Fixed

- Properly exports public members ([#5224](https://github.com/MetaMask/core/pull/5224))
  - The new events (`AccountsController:account{AssetList,Balances,Transactions}Updated`) from the previous versions but were not exported.

## [22.0.0]

### Added

- Add `AccountsController:account{AssetList,Balances,Transactions}Updated` events ([#5190](https://github.com/MetaMask/core/pull/5190))
  - Those events are being sent from Account Snaps (through the Snap keyring) and are being re-published by the `AccountController`.

### Changed

- **BREAKING:** Now requires `SnapKeyring:account{AssetList,Balances,Transactions}Updated` events to be registered on the messenger ([#5190](https://github.com/MetaMask/core/pull/5190))
- Bump `@metamask/keyring-api` from `^14.0.0` to `^16.1.0` ([#5190](https://github.com/MetaMask/core/pull/5190)), ([#5208](https://github.com/MetaMask/core/pull/5208))
- Bump `@metamask/keyring-internal-api` from `^2.0.1` to `^4.0.1` ([#5190](https://github.com/MetaMask/core/pull/5190)), ([#5208](https://github.com/MetaMask/core/pull/5208))
- Bump `@metamask/eth-snap-keyring` from `^8.1.1` to `^9.1.1` ([#5190](https://github.com/MetaMask/core/pull/5190)), ([#5208](https://github.com/MetaMask/core/pull/5208))

## [21.0.2]

### Changed

- Bump `@metamask/keyring-api` from `^13.0.0` to `^14.0.0` ([#5177](https://github.com/MetaMask/core/pull/5177))
- Bump `@metamask/keyring-internal-api` from `^2.0.0` to `^2.0.1` ([#5177](https://github.com/MetaMask/core/pull/5177))
- Bump `@metamask/eth-snap-keyring` from `^8.1.0` to `^8.1.1` ([#5177](https://github.com/MetaMask/core/pull/5177))

## [21.0.1]

### Changed

- Bump `@metamask/eth-snap-keyring` from `^8.0.0` to `^8.1.0` ([#5167](https://github.com/MetaMask/core/pull/5167))

## [21.0.0]

### Changed

- **BREAKING:** Add `scopes` field to `KeyringAccount` ([#5066](https://github.com/MetaMask/core/pull/5066)), ([#5136](https://github.com/MetaMask/core/pull/5136))
  - This field is now required and will be used to identify the supported chains (using CAIP-2 chain IDs) for every accounts.
- Bump `@metamask/base-controller` from `^7.0.0` to `^7.1.1` ([#5079](https://github.com/MetaMask/core/pull/5079)), ([#5135](https://github.com/MetaMask/core/pull/5135))
- Bump `@metamask/utils` to `^11.0.1` ([#5080](https://github.com/MetaMask/core/pull/5080))
- Bump `@metamask/rpc-errors` to `^7.0.2` ([#5080](https://github.com/MetaMask/core/pull/5080))

## [20.0.2]

### Changed

- Use new `@metamask/keyring-internal-api@^1.0.0` ([#4695](https://github.com/MetaMask/core/pull/4695))
  - This package has been split out from the Keyring API.
- Bump `@metamask/keyring-api` from `^10.1.0` to `^12.0.0` ([#4695](https://github.com/MetaMask/core/pull/4695))
- Bump `@metamask/eth-snap-keyring` from `^5.0.1` to `^7.0.0` ([#4695](https://github.com/MetaMask/core/pull/4695))
  - ESM/CommonJS support.

## [20.0.1]

### Fixed

- Make implicit peer dependencies explicit ([#4974](https://github.com/MetaMask/core/pull/4974))
  - Add the following packages as peer dependencies of this package to satisfy peer dependency requirements from other dependencies:
    - `@metamask/providers` `^18.1.0` (required by `@metamask/keyring-api`)
    - `webextension-polyfill` `^0.10.0 || ^0.11.0 || ^0.12.0` (required by `@metamask/providers`)
  - These dependencies really should be present in projects that consume this package (e.g. MetaMask clients), and this change ensures that they now are.
  - Furthermore, we are assuming that clients already use these dependencies, since otherwise it would be impossible to consume this package in its entirety or even create a working build. Hence, the addition of these peer dependencies is really a formality and should not be breaking.
- Correct ESM-compatible build so that imports of the following packages that re-export other modules via `export *` are no longer corrupted: ([#5011](https://github.com/MetaMask/core/pull/5011))
  - `@metamask/keyring-api`
  - `@metamask/eth-snap-keyring`

## [20.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/keyring-controller` from `^18.0.0` to `^19.0.0` ([#4915](https://github.com/MetaMask/core/pull/4956))
- **BREAKING:** Bump `@metamask/keyring-api` from `^8.1.3` to `^10.1.0` ([#4948](https://github.com/MetaMask/core/pull/4948))
  - If you are depending on `@metamask/providers` directly, you will need to upgrade to `18.1.0`.
- Bump `@metamask/eth-snap-keyring` from `^4.3.6` to `^5.0.1` ([#4948](https://github.com/MetaMask/core/pull/4948))
- Bump `@metamask/snaps-utils` from `^4.3.6` to `^8.3.0` ([#4948](https://github.com/MetaMask/core/pull/4948))
- Bump `@metamask/snaps-sdk` from `^6.5.0` to `^6.7.0` ([#4948](https://github.com/MetaMask/core/pull/4948))

## [19.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/keyring-controller` from `^17.0.0` to `^18.0.0` ([#4915](https://github.com/MetaMask/core/pull/4915))

## [18.2.3]

### Changed

- Bump `@metamask/base-controller` from `^7.0.1` to `^7.0.2` ([#4862](https://github.com/MetaMask/core/pull/4862))
- Bump `@metamask/utils` from `^9.1.0` to `^10.0.0` ([#4831](https://github.com/MetaMask/core/pull/4831))
- Bump dev dependency `@metamask/keyring-controller` from `^17.2.2` to `^17.3.1` ([#4810](https://github.com/MetaMask/core/pull/4810), [#4870](https://github.com/MetaMask/core/pull/4870))

## [18.2.2]

### Changed

- Bump accounts related packages ([#4713](https://github.com/MetaMask/core/pull/4713)), ([#4728](https://github.com/MetaMask/core/pull/4728))
  - Those packages are now built slightly differently and are part of the [accounts monorepo](https://github.com/MetaMask/accounts).
  - Bump `@metamask/keyring-api` from `^8.1.0` to `^8.1.4`
  - Bump `@metamask/eth-snap-keyring` from `^4.3.3` to `^4.3.6`

## [18.2.1]

### Changed

- Bump `@metamask/eth-snap-keyring` from `^4.3.1` to `^4.3.3` ([#4689](https://github.com/MetaMask/core/pull/4689))
- Bump `@metamask/snaps-sdk` from `^6.1.1` to `^6.5.0` ([#4689](https://github.com/MetaMask/core/pull/4689))
- Bump `@metamask/snaps-utils` from `^7.8.1` to `^8.1.1` ([#4689](https://github.com/MetaMask/core/pull/4689))
- Bump peer dependency `@metamask/snaps-controllers` from `^9.3.0` to `^9.7.0` ([#4689](https://github.com/MetaMask/core/pull/4689))

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

## [18.2.0]

### Added

- Add event `AccountsController:accountRenamed` and export corresponding event type `AccountsControllerAccountRenamedEvent` ([#4664](https://github.com/MetaMask/core/pull/4664)), ([#4660](https://github.com/MetaMask/core/pull/4660))
- Add new `nameLastUpdatedAt` timestamp to account's metadata ([#4589](https://github.com/MetaMask/core/pull/4589))

### Changed

- Consolidate `setAccountName` logic in `updateAccountMetadata` ([#4663](https://github.com/MetaMask/core/pull/4663))
  - Moved the logic for checking account name uniqueness and triggering the `accountRenamed` event from`setAccountName` to `updateAccountMetadata`. The `setAccountName` method now calls`updateAccountMetadata` to handle these tasks.

## [18.1.1]

### Changed

- Bump `@metamask/base-controller` from `^6.0.3` to `^7.0.0` ([#4643](https://github.com/MetaMask/core/pull/4643))

## [18.1.0]

### Added

- Export `AccountsControllerUpdateAccountMetadataAction` action ([#4590](https://github.com/MetaMask/core/pull/4590))
- Add new method `updateAccountMetadata` ([#4568](https://github.com/MetaMask/core/pull/4568))

### Changed

- Bump `@metamask/keyring-api` to version `8.1.0` ([#4594](https://github.com/MetaMask/core/pull/4594))

### Fixed

- Handle undefined `selectedAccount` in `updateAccounts` ([#4623](https://github.com/MetaMask/core/pull/4623))
- Fix `AccountsControllerUpdateAccountMetadataAction` action type name ([#4590](https://github.com/MetaMask/core/pull/4590))

## [18.0.0]

### Changed

- **BREAKING:** Bump peerDependency `@metamask/snaps-controllers` from `^8.1.1` to `^9.3.0` ([#3645](https://github.com/MetaMask/core/pull/3645))
- Remove `@metamask/keyring-controller` dependency [#4556](https://github.com/MetaMask/core/pull/4556)
  - This was listed under `peerDependencies` already, so it was redundant as a dependency.
- Upgrade TypeScript version to `~5.0.4` and set `moduleResolution` option to `Node16` ([#3645](https://github.com/MetaMask/core/pull/3645))
- Bump `@metamask/base-controller` from `^6.0.0` to `^6.0.2` ([#4517](https://github.com/MetaMask/core/pull/4517), [#4544](https://github.com/MetaMask/core/pull/4544))
- Bump `@metamask/keyring-api` from `^8.0.0` to `^8.0.1` ([#3645](https://github.com/MetaMask/core/pull/3645))
- Bump `@metamask/snaps-sdk` from `^4.2.0` to `^6.1.1` ([#3645](https://github.com/MetaMask/core/pull/3645), [#4547](https://github.com/MetaMask/core/pull/4547))
- Bump `@metamask/snaps-utils` from `^7.4.0` to `^7.8.1` ([#3645](https://github.com/MetaMask/core/pull/3645), [#4547](https://github.com/MetaMask/core/pull/4547))
- Bump `@metamask/utils` from `^8.3.0` to `^9.1.0` ([#4516](https://github.com/MetaMask/core/pull/4516), [#4529](https://github.com/MetaMask/core/pull/4529))

## [17.2.0]

### Added

- Add internal actions and events to `AccountsController` ([#4496](https://github.com/MetaMask/core/pull/4496), [#4497](https://github.com/MetaMask/core/pull/4497))
  - Add events `AccountsController:accountAdded`, `AccountsController:accountRemoved`, and export corresponding event types `AccountsControllerAccountAddedEvent`, `AccountsControllerAccountRemovedEvent`.
  - Export action types `AccountsControllerListMultichainAccountsAction`, `AccountsControllerGetSelectedMultichainAccountAction`, `AccountsControllerGetNextAvailableAccountNameAction`.

### Changed

- Improve support of non-EVM accounts ([#4494](https://github.com/MetaMask/core/pull/4494))
  - We now use `listMultichainAccounts` instead of `listAccounts` for non-EVM specific multichain methods
- Emit `selectedAccountChange` and update `lastSelected` for initial account ([#4494](https://github.com/MetaMask/core/pull/4494))

## [17.1.1]

### Fixed

- Handle edge case of undefined `selectedAccount` during onboarding for `getSelectedMultichainAccount` ([#4466](https://github.com/MetaMask/core/pull/4466))

## [17.1.0]

### Added

- Add `AccountsController:listMultichainAccounts` action ([#4426](https://github.com/MetaMask/core/pull/4426))

### Fixed

- Refactored `getSelectedAccount` to handle case when there are no accounts to return. The logic was previously contained in `getAccountExpect` has been transferred to `getSelectedAccount`. ([#4322](https://github.com/MetaMask/core/pull/4322))
- Updated `handleAccountRemoved` to automatically select the most recent account if the removed account was the currently selected account. ([#4322](https://github.com/MetaMask/core/pull/4322))
- Move `@metamask/keyring-controller` to dependency ([#4425](https://github.com/MetaMask/core/pull/4425))

## [17.0.0]

### Changed

- **BREAKING:** Newly added account is no longer set as the last selected account ([#4363](https://github.com/MetaMask/core/pull/4363))
- Bump `@metamask/eth-snap-keyring` to `^4.3.1` ([#4405](https://github.com/MetaMask/core/pull/4405))
- Bump `@metamask/keyring-api` to `^8.0.0` ([#4405](https://github.com/MetaMask/core/pull/4405))
- Bump `@metamask/keyring-controller` to `^17.1.0` (`devDependencies`) ([#4413](https://github.com/MetaMask/core/pull/4413))

### Fixed

- Use `listMultichainAccount` in `getAccountByAddress` ([#4375](https://github.com/MetaMask/core/pull/4375))

## [16.0.0]

### Changed

- **BREAKING:** Bump minimum Node version to 18.18 ([#3611](https://github.com/MetaMask/core/pull/3611))
- **BREAKING:** Bump peer dependency `@metamask/keyring-controller` to `^17.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- Bump `@metamask/base-controller` to `^6.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))

## [15.0.0]

### Added

- Add `getNextAvailableAccountName` method and `AccountsController:getNextAvailableAccountName` controller action ([#4326](https://github.com/MetaMask/core/pull/4326))
- Add `listMultichainAccounts` method for getting accounts on a specific chain or the default chain ([#4330](https://github.com/MetaMask/core/pull/4330))
- Add `getSelectedMultichainAccount` method and `AccountsController:getSelectedMultichainAccount` controller action for getting the selected account on a specific chain or the default chain ([#4330](https://github.com/MetaMask/core/pull/4330))

### Changed

- **BREAKING:** Bump peer dependency `@metamask/snaps-controllers` to `^8.1.1` ([#4262](https://github.com/MetaMask/core/pull/4262))
- **BREAKING:** Bump peer dependency `@metamask/keyring-controller` to `^16.1.0` ([#4342](https://github.com/MetaMask/core/pull/4342))
- **BREAKING:** `listAccounts` now filters the list of accounts in state to EVM accounts ([#4330](https://github.com/MetaMask/core/pull/4330))
- **BREAKING:** `getSelectedAccount` now throws if the selected account is not an EVM account ([#4330](https://github.com/MetaMask/core/pull/4330))
- Bump `@metamask/eth-snap-keyring` to `^4.1.1` ([#4262](https://github.com/MetaMask/core/pull/4262))
- Bump `@metamask/keyring-api` to `^6.1.1` ([#4262](https://github.com/MetaMask/core/pull/4262))
- Bump `@metamask/snaps-sdk` to `^4.2.0` ([#4262](https://github.com/MetaMask/core/pull/4262))
- Bump `@metamask/snaps-utils` to `^7.4.0` ([#4262](https://github.com/MetaMask/core/pull/4262))

### Fixed

- Fix "Type instantiation is excessively deep and possibly infinite" TypeScript error ([#4331](https://github.com/MetaMask/core/pull/4331))

## [14.0.0]

### Changed

- **BREAKING** Bump `@metamask/keyring-controller` peer dependency to ^16.0.0 ([#4234](https://github.com/MetaMask/core/pull/4234))
- Bump `@metamask/keyring-api` to 6.0.0, `@metamask/eth-snap-keyring` to 4.0.0 and snap dependencies ([#4193](https://github.com/MetaMask/core/pull/4193))
- Bump `@metamask/base-controller` to `^5.0.2` ([#4232](https://github.com/MetaMask/core/pull/4232))

## [13.0.0]

### Changed

- Fix update setSelectedAccount to throw if the id is not found ([#4167](https://github.com/MetaMask/core/pull/4167))
- Fix normal account indexing naming with index gap ([#4089](https://github.com/MetaMask/core/pull/4089))
- **BREAKING** Bump peer dependency `@metamask/snaps-controllers` to `^6.0.3` and dependencies `@metamask/snaps-sdk` to `^3.1.1`, `@metamask/eth-snap-keyring` to `^3.0.0`([#4090](https://github.com/MetaMask/core/pull/4090))

## [12.0.1]

### Fixed

- Fix `types` field in `package.json` ([#4047](https://github.com/MetaMask/core/pull/4047))

## [12.0.0]

### Added

- **BREAKING**: Add ESM build ([#3998](https://github.com/MetaMask/core/pull/3998))
  - It's no longer possible to import files from `./dist` directly.

### Changed

- **BREAKING:** Bump `@metamask/base-controller` to `^5.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
  - This version has a number of breaking changes. See the changelog for more.
- **BREAKING:** Bump peer dependency on `@metamask/keyring-controller` to `^14.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))

### Removed

- **BREAKING:** Remove action and event types unrelated to `AccountsController` from `AccountsControllerActions` and `AccountsControllerEvents` ([#4031](https://github.com/MetaMask/core/pull/4031))

### Fixed

- **BREAKING:** Narrow allowed actions and event type for `AccountsController` messenger ([#4021](https://github.com/MetaMask/core/pull/4021), [#4031](https://github.com/MetaMask/core/pull/4031))
  - Narrow type parameter `AllowedAction` from `string` to `(KeyringControllerGetKeyringForAccountAction | KeyringControllerGetKeyringsByTypeAction | KeyringControllerGetAccountsAction)['type']`.
  - Narrow type parameter `AllowedEvent` from `string` to `(SnapStateChange | KeyringControllerStateChangeEvent)['type']`, removing other events from `SnapController` and `KeyringController`.

## [11.0.0]

### Changed

- **BREAKING:** Bump `@metamask/keyring-controller` peer dependency to `^13.0.0` ([#4007](https://github.com/MetaMask/core/pull/4007))
- Replace `ethereumjs-util` with `@ethereumjs/util` and `ethereum-cryptography` ([#3943](https://github.com/MetaMask/core/pull/3943))

### Fixed

- Update `keyringTypeToName` to return the correct name for custody keyrings ([#3899](https://github.com/MetaMask/core/pull/3899))

## [10.0.0]

### Changed

- **BREAKING:** Bump `@metamask/keyring-controller` peer dependency to `^12.2.0` ([#3821](https://github.com/MetaMask/core/pull/3821))
- Bump `@metamask/base-controller` to `^4.1.1` ([#3821](https://github.com/MetaMask/core/pull/3821))

## [9.0.0]

### Added

- Add methods to support ERC-4337 accounts ([#3602](https://github.com/MetaMask/core/pull/3602))
- Add getAccount action to AccountsController ([#1892](https://github.com/MetaMask/core/pull/1892))

### Changed

- **BREAKING:** Bump `@metamask/keyring-controller` peer dependency to ^12.1.0 ([#3747](https://github.com/MetaMask/core/pull/3747), [#3810](https://github.com/MetaMask/core/pull/3810))
- **BREAKING:** Bump `@metamask/snaps-controllers` peer dependency to ^4.0.0 ([#3747](https://github.com/MetaMask/core/pull/3747))
- Bump `@metamask/keyring-api` to ^3.0.0 ([#3747](https://github.com/MetaMask/core/pull/3747))
- Bump `@metamask/utils` to `^8.3.0`([#3769](https://github.com/MetaMask/core/pull/3769))

### Fixed

- Fix quick succession of submit password causing Accounts Controller state to be cleared ([#3802](https://github.com/MetaMask/core/pull/3802))

## [8.0.0]

### Changed

- **BREAKING:** Bump `@metamask/keyring-controller` to ^12.0.0

## [7.0.1]

### Changed

- Bump snaps dependencies ([#3734](https://github.com/MetaMask/core/pull/3734))

## [7.0.0]

### Changed

- **BREAKING:** Bump `@metamask/keyring-controller` peer dependency from `^10.0.0` to `^11.0.0` ([#3695](https://github.com/MetaMask/core/pull/3695))
- **BREAKING:** Add `@metamask/snaps-controllers` as a peer dependency ([#3607](https://github.com/MetaMask/core/pull/3607))
- Bump `@metamask/base-controller` to `^4.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695))

## [6.0.0]

### Changed

- **BREAKING:** Bump `@metamask/base-controller` to ^4.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
  - This is breaking because the type of the `messenger` has backward-incompatible changes. See the changelog for this package for more.
- Bump `@metamask/keyring-controller` to ^10.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))

## [5.0.0]

### Changed

- **BREAKING:** Bump dependency and peer dependency on `@metamask/keyring-controller` to ^9.0.0
- Bump `@metamask/snaps-utils` and `@metamask/snaps-controller` to 3.2.0 ([#1917](https://github.com/MetaMask/core/pull/1917), [#1944](https://github.com/MetaMask/core/pull/1944), [#1977](https://github.com/MetaMask/core/pull/1977))
- Bump @metamask/utils from 8.1.0 to 8.2.0 ([#1957](https://github.com/MetaMask/core/pull/1957))
- Bump @metamask/keyring-api from 1.0.0 to 1.1.0 ([#1951](https://github.com/MetaMask/core/pull/1951))

## [4.0.0]

### Changed

- **BREAKING** Update the `onKeyringStateChange` and `onSnapStateChange` methods, and remove the `keyringApiEnabled` from the AccountsController ([#1839](https://github.com/MetaMask/core/pull/1839))
- Add getSelectedAccount and getAccountByAddress actions to AccountsController ([#1858](https://github.com/MetaMask/core/pull/1858))

## [3.0.0]

### Changed

- **BREAKING:** Bump dependency on `@metamask/eth-snap-keyring` to ^1.0.0 ([#1735](https://github.com/MetaMask/core/pull/1735))
- **BREAKING:** Bump dependency on `@metamask/keyring-api` to ^1.0.0 ([#1735](https://github.com/MetaMask/core/pull/1735))
- **BREAKING:** Bump dependency on `@metamask/snaps-utils` to ^3.0.0 ([#1735](https://github.com/MetaMask/core/pull/1735))
- Bump dependency and peer dependency on `@metamask/keyring-controller` to ^8.0.3

## [2.0.2]

### Changed

- Bump dependency on `@metamask/utils` to ^8.1.0 ([#1639](https://github.com/MetaMask/core/pull/1639))
- Bump dependency on `@metamask/base-controller` to ^3.2.3
- Bump peer dependency on `@metamask/keyring-controller` to ^8.0.2

## [2.0.1]

### Changed

- Update TypeScript to v4.8.x ([#1718](https://github.com/MetaMask/core/pull/1718))

### Fixed

- Remove unused `selectedAccount` from state metadata ([#1734](https://github.com/MetaMask/core/pull/1734))

## [2.0.0]

### Changed

- **BREAKING:** Bump peer dependency on `@metamask/keyring-controller` to ^8.0.0

## [1.0.0]

### Added

- Initial release ([#1637](https://github.com/MetaMask/core/pull/1637))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@32.0.1...HEAD
[32.0.1]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@32.0.0...@metamask/accounts-controller@32.0.1
[32.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@31.0.0...@metamask/accounts-controller@32.0.0
[31.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@30.0.0...@metamask/accounts-controller@31.0.0
[30.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@29.0.1...@metamask/accounts-controller@30.0.0
[29.0.1]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@29.0.0...@metamask/accounts-controller@29.0.1
[29.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@28.0.0...@metamask/accounts-controller@29.0.0
[28.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@27.0.0...@metamask/accounts-controller@28.0.0
[27.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@26.1.0...@metamask/accounts-controller@27.0.0
[26.1.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@26.0.0...@metamask/accounts-controller@26.1.0
[26.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@25.0.0...@metamask/accounts-controller@26.0.0
[25.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@24.1.0...@metamask/accounts-controller@25.0.0
[24.1.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@24.0.1...@metamask/accounts-controller@24.1.0
[24.0.1]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@24.0.0...@metamask/accounts-controller@24.0.1
[24.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@23.1.0...@metamask/accounts-controller@24.0.0
[23.1.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@23.0.1...@metamask/accounts-controller@23.1.0
[23.0.1]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@23.0.0...@metamask/accounts-controller@23.0.1
[23.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@22.0.0...@metamask/accounts-controller@23.0.0
[22.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@21.0.2...@metamask/accounts-controller@22.0.0
[21.0.2]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@21.0.1...@metamask/accounts-controller@21.0.2
[21.0.1]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@21.0.0...@metamask/accounts-controller@21.0.1
[21.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@20.0.2...@metamask/accounts-controller@21.0.0
[20.0.2]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@20.0.1...@metamask/accounts-controller@20.0.2
[20.0.1]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@20.0.0...@metamask/accounts-controller@20.0.1
[20.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@19.0.0...@metamask/accounts-controller@20.0.0
[19.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@18.2.3...@metamask/accounts-controller@19.0.0
[18.2.3]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@18.2.2...@metamask/accounts-controller@18.2.3
[18.2.2]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@18.2.1...@metamask/accounts-controller@18.2.2
[18.2.1]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@18.2.0...@metamask/accounts-controller@18.2.1
[18.2.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@18.1.1...@metamask/accounts-controller@18.2.0
[18.1.1]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@18.1.0...@metamask/accounts-controller@18.1.1
[18.1.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@18.0.0...@metamask/accounts-controller@18.1.0
[18.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@17.2.0...@metamask/accounts-controller@18.0.0
[17.2.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@17.1.1...@metamask/accounts-controller@17.2.0
[17.1.1]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@17.1.0...@metamask/accounts-controller@17.1.1
[17.1.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@17.0.0...@metamask/accounts-controller@17.1.0
[17.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@16.0.0...@metamask/accounts-controller@17.0.0
[16.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@15.0.0...@metamask/accounts-controller@16.0.0
[15.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@14.0.0...@metamask/accounts-controller@15.0.0
[14.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@13.0.0...@metamask/accounts-controller@14.0.0
[13.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@12.0.1...@metamask/accounts-controller@13.0.0
[12.0.1]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@12.0.0...@metamask/accounts-controller@12.0.1
[12.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@11.0.0...@metamask/accounts-controller@12.0.0
[11.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@10.0.0...@metamask/accounts-controller@11.0.0
[10.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@9.0.0...@metamask/accounts-controller@10.0.0
[9.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@8.0.0...@metamask/accounts-controller@9.0.0
[8.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@7.0.1...@metamask/accounts-controller@8.0.0
[7.0.1]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@7.0.0...@metamask/accounts-controller@7.0.1
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@6.0.0...@metamask/accounts-controller@7.0.0
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@5.0.0...@metamask/accounts-controller@6.0.0
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@4.0.0...@metamask/accounts-controller@5.0.0
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@3.0.0...@metamask/accounts-controller@4.0.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@2.0.2...@metamask/accounts-controller@3.0.0
[2.0.2]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@2.0.1...@metamask/accounts-controller@2.0.2
[2.0.1]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@2.0.0...@metamask/accounts-controller@2.0.1
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@1.0.0...@metamask/accounts-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/accounts-controller@1.0.0
