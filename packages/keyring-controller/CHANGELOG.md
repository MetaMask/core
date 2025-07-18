# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Bump `@metamask/keyring-api` from `^18.0.0` to `^19.0.0` ([#6146](https://github.com/MetaMask/core/pull/6146))
- Bump `@metamask/keyring-internal-api` from `^6.2.0` to `^7.0.0` ([#6146](https://github.com/MetaMask/core/pull/6146))
- Bump `@metamask/utils` from `^11.2.0` to `^11.4.2` ([#6054](https://github.com/MetaMask/core/pull/6054))

## [22.1.0]

### Added

- Add method `exportEncryptionKey` ([#5984](https://github.com/MetaMask/core/pull/5984))

### Changed

- Make salt optional with method `submitEncryptionKey` ([#5984](https://github.com/MetaMask/core/pull/5984))

## [22.0.2]

### Fixed

- Fixed serialized keyring comparison when establishing whether a vault update is needed ([#5928](https://github.com/MetaMask/core/pull/5928))
  - The vault update was being skipped when a keyring class returns an object shallow copy through `.serialize()`.

## [22.0.1]

### Changed

- Bump `@metamask/keyring-api` dependency from `^17.4.0` to `^18.0.0` ([#5871](https://github.com/MetaMask/core/pull/5871))
- Bump `@metamask/keyring-internal-api` dependency from `^6.0.1` to `^6.2.0` ([#5871](https://github.com/MetaMask/core/pull/5871))

## [22.0.0]

### Changed

- **BREAKING** `keyringsMetadata` has been removed from the controller state ([#5725](https://github.com/MetaMask/core/pull/5725))
  - The metadata is now stored in each keyring object in the `state.keyrings` array.
  - When updating to this version, we recommend removing the `keyringsMetadata` state and all state referencing a keyring ID with a migration. New metadata will be generated for each keyring automatically after the update.

### Fixed

- Keyrings with duplicate accounts are skipped as unsupported on unlock ([#5775](https://github.com/MetaMask/core/pull/5775))

## [21.0.6]

### Changed

- Prevent emitting `:stateChange` from `withKeyring` unnecessarily ([#5732](https://github.com/MetaMask/core/pull/5732))

## [21.0.5]

### Changed

- Bump `@metamask/base-controller` from ^8.0.0 to ^8.0.1 ([#5722](https://github.com/MetaMask/core/pull/5722))

### Fixed

- The vault encryption upgrade fails gracefully during login ([#5740](https://github.com/MetaMask/core/pull/5740))

## [21.0.4]

### Fixed

- Ensure no duplicate accounts are persisted ([#5710](https://github.com/MetaMask/core/pull/5710))

## [21.0.3]

### Changed

- `ExportableKeyEncryptor` is now a generic type with a type parameter `EncryptionKey` ([#5395](https://github.com/MetaMask/core/pull/5395))
  - The type parameter defaults to `unknown`

### Fixed

- Fixed wrong error message thrown when using the wrong password ([#5627](https://github.com/MetaMask/core/pull/5627))

## [21.0.2]

### Changed

- Bump `@metamask/keyring-api` from `^17.2.0` to `^17.4.0` ([#5565](https://github.com/MetaMask/core/pull/5565))
- Bump `@metamask/keyring-internal-api` from `^6.0.0` to `^6.0.1` ([#5565](https://github.com/MetaMask/core/pull/5565))

### Fixed

- Ignore cached encryption key when the vault needs to upgrade its encryption parameters ([#5601](https://github.com/MetaMask/core/pull/5601))

## [21.0.1]

### Fixed

- Fixed duplication of unsupported keyrings ([#5535](https://github.com/MetaMask/core/pull/5535))
- Enforce keyrings metadata alignment when unlocking existing vault ([#5535](https://github.com/MetaMask/core/pull/5535))
- Fixed frozen object mutation attempt when updating metadata ([#5535](https://github.com/MetaMask/core/pull/5535))

## [21.0.0] [DEPRECATED]

### Changed

- **BREAKING:** Bump `@metamask/keyring-internal-api` from `^5.0.0` to `^6.0.0` ([#5347](https://github.com/MetaMask/core/pull/5347))
- **BREAKING:** Bump `@metamask/eth-simple-keyring` from `^9.0.0` to `^10.0.0` ([#5347](https://github.com/MetaMask/core/pull/5347))
- **BREAKING:** Bump `@metamask/eth-hd-keyring` from `^11.0.0` to `^12.0.0` ([#5347](https://github.com/MetaMask/core/pull/5347))
- **BREAKING:** Bump `@ethereumjs/util` from `^8.1.0` to `^9.1.0` ([#5347](https://github.com/MetaMask/core/pull/5347))

## [20.0.0] [DEPRECATED]

### Changed

- **BREAKING:** `addNewKeyring` method now returns `Promise<KeyringMetadata>` instead of `Promise<unknown>` ([#5372](https://github.com/MetaMask/core/pull/5372))
  - Consumers can use the returned `KeyringMetadata.id` to access the created keyring instance via `withKeyring`.
- **BREAKING:** `withKeyring` method now requires a callback argument of type `({ keyring: SelectedKeyring; metadata: KeyringMetadata }) => Promise<CallbackResult>` ([#5372](https://github.com/MetaMask/core/pull/5372))
- Bump `@metamask/keyring-internal-api` from `^4.0.3` to `^5.0.0` ([#5405](https://github.com/MetaMask/core/pull/5405))
- Bump `@metamask/eth-hd-keyring` from `^10.0.0` to `^11.0.0` ([#5405](https://github.com/MetaMask/core/pull/5405))
- Bump `@metamask/eth-simple-keyring` from `^8.1.0` to `^9.0.0` ([#5405](https://github.com/MetaMask/core/pull/5405))

## [19.2.2]

### Fixed

- Fixed duplication of unsupported keyrings ([#5535](https://github.com/MetaMask/core/pull/5535))
- Enforce keyrings metadata alignment when unlocking existing vault ([#5535](https://github.com/MetaMask/core/pull/5535))
- Fixed frozen object mutation attempt when updating metadata ([#5535](https://github.com/MetaMask/core/pull/5535))

## [19.2.1] [DEPRECATED]

### Changed

- Bump `@metamask/keyring-api"` from `^17.0.0` to `^17.2.0` ([#5366](https://github.com/MetaMask/core/pull/5366))
- Bump `@metamask/keyring-internal-api` from `^4.0.1` to `^4.0.3` ([#5356](https://github.com/MetaMask/core/pull/5356)), ([#5366](https://github.com/MetaMask/core/pull/5366))

### Fixed

- Ensure authorization contract address is provided ([#5353](https://github.com/MetaMask/core/pull/5353))

## [19.2.0] [DEPRECATED]

### Added

- Add `signEip7702Authorization` to `KeyringController` ([#5301](https://github.com/MetaMask/core/pull/5301))
- Add `KeyringController:withKeyring` action ([#5332](https://github.com/MetaMask/core/pull/5332))
  - The action can be used to consume the `withKeyring` method of the `KeyringController` class
- Support keyring metadata in KeyringController ([#5112](https://github.com/MetaMask/core/pull/5112))

## [19.1.0]

### Added

- Add new keyring type for OneKey ([#5216](https://github.com/MetaMask/core/pull/5216))

### Changed

- A specific error message is thrown when any operation is attempted while the controller is locked ([#5172](https://github.com/MetaMask/core/pull/5172))

## [19.0.7]

### Changed

- Bump `@metamask/base-controller` from `^7.1.1` to `^8.0.0` ([#5305](https://github.com/MetaMask/core/pull/5305))
- Bump `@metamask/message-manager` from `^12.0.0` to `^12.0.1` ([#5305](https://github.com/MetaMask/core/pull/5305))

## [19.0.6]

### Changed

- Bump `@metamask/keyring-api"` from `^16.1.0` to `^17.0.0` ([#5280](https://github.com/MetaMask/core/pull/5280))
- Bump `@metamask/utils` from `^11.0.1` to `^11.1.0` ([#5223](https://github.com/MetaMask/core/pull/5223))

## [19.0.5]

### Changed

- Bump `@metamask/keyring-api` from `^14.0.0` to `^16.1.0` ([#5190](https://github.com/MetaMask/core/pull/5190)), ([#5208](https://github.com/MetaMask/core/pull/5208))

## [19.0.4]

### Changed

- Bump `@metamask/keyring-api` from `^13.0.0` to `^14.0.0` ([#5177](https://github.com/MetaMask/core/pull/5177))
- Bump `@metamask/keyring-internal-api` from `^2.0.0` to `^2.0.1` ([#5177](https://github.com/MetaMask/core/pull/5177))
- Bump `@metamask/message-manager` from `^12.0.0` to `^11.0.3` ([#5169](https://github.com/MetaMask/core/pull/5169))

## [19.0.3]

### Changed

- Bump `@metamask/base-controller` from `^7.0.0` to `^7.1.1` ([#5079](https://github.com/MetaMask/core/pull/5079)), ([#5135](https://github.com/MetaMask/core/pull/5135))
- Bump `@metamask/keyring-api` from `^12.0.0` to `^13.0.0` ([#5066](https://github.com/MetaMask/core/pull/5066))
- Bump `@metamask/keyring-internal-api` from `^1.0.0` to `^2.0.0` ([#5066](https://github.com/MetaMask/core/pull/5066)), ([#5136](https://github.com/MetaMask/core/pull/5136))
- Bump `@metamask/utils` to `^11.0.1` ([#5080](https://github.com/MetaMask/core/pull/5080))
- Bump `@metamask/rpc-errors` to `^7.0.2` ([#5080](https://github.com/MetaMask/core/pull/5080))

### Fixed

- Make `verifySeedPhrase` mutually exclusive ([#5077](https://github.com/MetaMask/core/pull/5077))

## [19.0.2]

### Changed

- Remove use of `@metamask/keyring-api` ([#4695](https://github.com/MetaMask/core/pull/4695))
  - `@metamask/providers` and `webextension-polyfill` peer depedencies are no longer required.
- Use new `@metamask/keyring-internal-api@^1.0.0` ([#4695](https://github.com/MetaMask/core/pull/4695))
  - This package has been split out from the Keyring API. Its types are compatible with the `@metamask/keyring-api` package used previously.
- Bump `@metamask/message-manager` from `^11.0.2` to `^11.0.3` ([#5048](https://github.com/MetaMask/core/pull/5048))

## [19.0.1]

### Changed

- Bump `@metamask/message-manager` from `^11.0.1` to `^11.0.2` ([#5012](https://github.com/MetaMask/core/pull/5012))

### Fixed

- Make implicit peer dependencies explicit ([#4974](https://github.com/MetaMask/core/pull/4974))
  - Add the following packages as peer dependencies of this package to satisfy peer dependency requirements from other dependencies:
    - `@metamask/providers` `^18.1.0` (required by `@metamask/keyring-api`)
    - `webextension-polyfill` `^0.10.0 || ^0.11.0 || ^0.12.0` (required by `@metamask/providers`)
  - These dependencies really should be present in projects that consume this package (e.g. MetaMask clients), and this change ensures that they now are.
  - Furthermore, we are assuming that clients already use these dependencies, since otherwise it would be impossible to consume this package in its entirety or even create a working build. Hence, the addition of these peer dependencies is really a formality and should not be breaking.
- Correct ESM-compatible build so that imports of the following packages that re-export other modules via `export *` are no longer corrupted: ([#5011](https://github.com/MetaMask/core/pull/5011))
  - `@metamask/eth-hd-keyring`
  - `@metamask/eth-simple-keyring`
  - `@ethereumjs/util`
  - `ethereumjs-wallet`

## [19.0.0]

### Changed

- **BREAKING:** Bump `@metamask/keyring-api` from `^8.1.3` to `^10.1.0` ([#4948](https://github.com/MetaMask/core/pull/4948))
  - If you are depending on `@metamask/providers` directly, you will need to upgrade to 18.1.0.

## [18.0.0]

### Removed

- **BREAKING** Remove `addNewAccountWithoutUpdate` method ([#4845](https://github.com/MetaMask/core/pull/4845))

## [17.3.1]

### Changed

- Bump `@metamask/base-controller` from `^7.0.1` to `^7.0.2` ([#4862](https://github.com/MetaMask/core/pull/4862))
- Bump `@metamask/utils` from `^9.1.0` to `^10.0.0` ([#4831](https://github.com/MetaMask/core/pull/4831))
- Bump `@metamask/eth-sig-util` from `^7.0.1` to `^8.0.0` ([#4830](https://github.com/MetaMask/core/pull/4830))

## [17.3.0]

### Changed

- Bump `@metamask/message-manager` from `^10.1.1` to `^11.0.0` ([#4805](https://github.com/MetaMask/core/pull/4805))

## [17.2.2]

### Changed

- Bump accounts related packages ([#4713](https://github.com/MetaMask/core/pull/4713)), ([#4728](https://github.com/MetaMask/core/pull/4728))
  - Those packages are now built slightly differently and are part of the [accounts monorepo](https://github.com/MetaMask/accounts).
  - Bump `@metamask/keyring-api` from `^8.1.0` to `^8.1.4`
  - Bump `@metamask/eth-hd-keyring` from `^7.0.1` to `^7.0.4`
  - Bump `@metamask/eth-simple-keyring` from `^6.0.1` to `^6.0.5`

## [17.2.1]

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

## [17.2.0]

### Added

- Add `KeyringController:addNewAccount` messenger action ([#4565](https://github.com/MetaMask/core/pull/4565))
  - Add and export `KeyringControllerAddNewAccountAction` type.
  - Widen `KeyringControllerActions` to include `KeyringControllerAddNewAccountAction` type.
  - `KeyringControllerMessenger` must allow `KeyringControllerAddNewAccountAction` type.

### Changed

- Bump `@metamask/base-controller` from `^6.0.2` to `^7.0.0` ([#4625](https://github.com/MetaMask/core/pull/4625), [#4643](https://github.com/MetaMask/core/pull/4643))
- Bump `@metamask/keyring-api` from `^8.0.1` to `^8.1.0` ([#4594](https://github.com/MetaMask/core/pull/4594))
- Bump `@metamask/message-manager` from `^10.0.2` to `^10.0.3` ([#4643](https://github.com/MetaMask/core/pull/4643))
- Bump `typescript` from `~5.0.4` to `~5.2.2` ([#4576](https://github.com/MetaMask/core/pull/4576), [#4584](https://github.com/MetaMask/core/pull/4584))

## [17.1.2]

### Changed

- Upgrade TypeScript version to `~5.0.4` and set `moduleResolution` option to `Node16` ([#3645](https://github.com/MetaMask/core/pull/3645))
- Bump `@metamask/base-controller` from `^6.0.0` to `^6.0.2` ([#4517](https://github.com/MetaMask/core/pull/4517), [#4544](https://github.com/MetaMask/core/pull/4544))
- Bump `@metamask/keyring-api` from `^8.0.0` to `^8.0.1` ([#3645](https://github.com/MetaMask/core/pull/3645))
- Bump `@metamask/utils` from `^9.0.0` to `^9.1.0` ([#4529](https://github.com/MetaMask/core/pull/4529))
- Bump `@metamask/message-manager` from `^10.0.1` to `^10.0.2` ([#4548](https://github.com/MetaMask/core/pull/4548))

## [17.1.1]

### Changed

- Bump `@metamask/utils` to `^9.0.0`, `@metamask/rpc-errors` to `^6.3.1` ([#4516](https://github.com/MetaMask/core/pull/4516))

### Fixed

- Clear encryption salt and key in `setLocked` and `#createNewVaultWithKeyring` to ensure that encryption key is always generated with the latest password ([#4514](https://github.com/MetaMask/core/pull/4514))

## [17.1.0]

### Added

- Add support for overwriting built-in keyring builders for the Simple and HD keyring ([#4362](https://github.com/MetaMask/core/pull/4362))

### Changed

- Bump `@metamask/eth-snap-keyring` to `^4.3.1` ([#4405](https://github.com/MetaMask/core/pull/4405))
- Bump `@metamask/keyring-api` to `^8.0.0` ([#4405](https://github.com/MetaMask/core/pull/4405))

### Deprecated

- Deprecate QR keyring methods ([#4365](https://github.com/MetaMask/core/pull/4365))
  - `cancelQRSignRequest`
  - `cancelQRSynchronization`
  - `connectQRHardware`
  - `forgetQRDevice`
  - `getOrAddQRKeyring`
  - `getQRKeyring`
  - `getQRKeyringState`
  - `resetQRKeyringState`
  - `restoreQRKeyring`
  - `submitQRCryptoHDKey`
  - `submitQRCryptoAccount`
  - `submitQRSignature`
  - `unlockQRHardwareWalletAccount`

## [17.0.0]

### Changed

- **BREAKING:** Bump minimum Node version to 18.18 ([#3611](https://github.com/MetaMask/core/pull/3611))
- Bump `@metamask/base-controller` to `^6.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- Bump `@metamask/message-manager` to `^10.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))

## [16.1.0]

### Added

- Add `changePassword` method ([#4279](https://github.com/MetaMask/core/pull/4279))
  - This method can be used to change the password used to encrypt the vault.
- Add support for non-EVM account addresses to most methods ([#4282](https://github.com/MetaMask/core/pull/4282))
  - Previously, all addresses were assumed to be Ethereum addresses and normalized, but now only Ethereum addresses are treated as such.
  - Relax type of `account` argument on `removeAccount` from `Hex` to `string`

### Changed

- Bump `@metamask/keyring-api` to `^6.1.1` ([#4262](https://github.com/MetaMask/core/pull/4262))
- Bump `@keystonehq/metamask-airgapped-keyring` to `^0.14.1` ([#4277](https://github.com/MetaMask/core/pull/4277))
- Bump `async-mutex` to `^0.5.0` ([#4335](https://github.com/MetaMask/core/pull/4335))
- Bump `@metamask/message-manager` to `^9.0.0` ([#4342](https://github.com/MetaMask/core/pull/4342))

### Fixed

- Fix QR keyrings so that they are not initialized with invalid state ([#4256](https://github.com/MetaMask/core/pull/4256))

## [16.0.0]

### Added

- Added `withKeyring` method ([#4197](https://github.com/MetaMask/core/pull/4197))
  - Consumers can now use `withKeyring` to atomically select a keyring by address or type and execute a callback with the it as argument.
  - This method can be used instead of `getKeyringForAccount`, `getKeyringsByType` and `persistAllKeyrings`, as the vault will be updated automatically after the callback execution, or rolled back in case of errors

### Changed

- **BREAKING**: Change various `KeyringController` methods so they no longer return the controller state ([#4199](https://github.com/MetaMask/core/pull/4199))
  - Changed `addNewAccount` return type to `Promise<string>`
  - Changed `addNewAccountWithoutUpdate` return type to `Promise<string>`
  - Changed `createNewVaultAndKeychain` return type to `Promise<void>`
  - Changed `createNewVaultAndRestore` return type to `Promise<void>`
  - Changed `importAccountWithStrategy` return type to `Promise<string>`
  - Changed `removeAccount` return type to `Promise<void>`
  - Changed `setLocked` return type to `Promise<void>`
  - Changed `submitEncryptionKey` return type to `Promise<void>`
  - Changed `submitPassword` return type to `Promise<void>`
- Bump `@metamask/keyring-api` to `^6.0.0` ([#4193](https://github.com/MetaMask/core/pull/4193))
- Bump `@metamask/base-controller` to `^5.0.2` ([#4232](https://github.com/MetaMask/core/pull/4232))
- Bump `@metamask/message-manager` to `^8.0.2` ([#4234](https://github.com/MetaMask/core/pull/4234))

### Fixed

- Method calls that change controller state are now atomic ([#4192](https://github.com/MetaMask/core/pull/4192))
  - Each method will roll back keyring instances in case of errors
- Method calls that change controller state are now mutually exclusive ([#4182](https://github.com/MetaMask/core/pull/4182))
- Check presence of `HDKeyring` when updating the vault ([#4168](https://github.com/MetaMask/core/pull/4168))
- Update state in single call when persisting or unlocking ([#4154](https://github.com/MetaMask/core/pull/4154))

## [15.0.0]

### Changed

- **BREAKING** use getAccounts on HD Keyring when calling addNewAccount ([#4158](https://github.com/MetaMask/core/pull/4158))
- Pass CAIP-2 scope to execution context ([#4090](https://github.com/MetaMask/core/pull/4090))
- Allow gas limits to be changed during #addPaymasterData ([#3942](https://github.com/MetaMask/core/pull/3942))

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
- Bump `@metamask/message-manager` to `^8.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))

### Fixed

- **BREAKING:** Narrow `KeyringControllerMessenger` type parameters `AllowedAction` and `AllowedEvent` from `string` to `never` ([#4031](https://github.com/MetaMask/core/pull/4031))
  - Allowlisting or using any external actions or events will now produce a type error.

## [13.0.0]

### Added

- Add `isCustodyKeyring` function ([#3899](https://github.com/MetaMask/core/pull/3899))
- Add `keyringBuilderFactory` utility function ([#3830](https://github.com/MetaMask/core/pull/3830))
- Add `GenericEncryptor`, `ExportableKeyEncryptor`, and `SerializedKeyring` types ([#3830](https://github.com/MetaMask/core/pull/3830))

### Changed

- Replace `ethereumjs-util` with `@ethereumjs/util` ([#3943](https://github.com/MetaMask/core/pull/3943))
- Bump `@metamask/message-manager` to `^7.3.9` ([#4007](https://github.com/MetaMask/core/pull/4007))

### Removed

- **BREAKING:** Remove callbacks `updateIdentities`, `syncIdentities`, `setSelectedAddress`, `setAccountLabel` from constructor options of the `KeyringController` class. These were previously used to update `PreferencesController` state, but are now replaced with `PreferencesController`'s subscription to the `KeyringController:stateChange` event. ([#3853](https://github.com/MetaMask/core/pull/3853))
  - Methods `addNewAccount`, `addNewAccountForKeyring`, `createNewVaultAndRestore`, `createNewVaultAndKeychain`, `importAccountWithStrategy`, `restoreQRKeyring`, `unlockQRHardwareWalletAccount`, and `forgetQRDevice` no longer directly update `PreferencesController` state by calling the `updateIdentities` callback.
  - Method `submitPassword` no longer directly updates `PreferencesController` state by calling the `syncIdentities` callback.
  - Method `unlockQRHardwareWalletAccount` no longer directly updates `PreferencesController` state by calling the `setAccountLabel` or `setSelectedAddress` callbacks.
- Remove `@metamask/eth-keyring-controller` dependency, and transfer dependencies to this package instead ([#3830](https://github.com/MetaMask/core/pull/3830))
  - `@metamask/eth-hd-keyring`
  - `@metamask/eth-simple-keyring`
  - `@metamask/eth-sig-util`
  - `@metamask/browser-passworder`

## [12.2.0]

### Added

- Add `getDefaultKeyringState` function ([#3799](https://github.com/MetaMask/core/pull/3799))

### Changed

- Bump `@metamask/base-controller` to `^4.1.1` ([#3821](https://github.com/MetaMask/core/pull/3821))
- Bump `@metamask/message-manager` to `^7.3.8` ([#3821](https://github.com/MetaMask/core/pull/3821))

### Removed

- Remove `peerDependency` and `devDependency` upon `@metamask/preferences-controller` ([#3799](https://github.com/MetaMask/core/pull/3799))
  - This dependency was just used to access the types of four methods. Those types are now inlined instead.

## [12.1.0]

### Added

- Add methods to support ERC-4337 accounts ([#3602](https://github.com/MetaMask/core/pull/3602))

### Changed

- Bump `@metamask/keyring-api` to ^3.0.0 ([#3747](https://github.com/MetaMask/core/pull/3747))
- Bump @metamask/eth-keyring-controller from 17.0.0 to 17.0.1 ([#3805](https://github.com/MetaMask/core/pull/3805))
- Bump `@metamask/utils` to `^8.3.0` ([#3769](https://github.com/MetaMask/core/pull/3769))

### Fixed

- Fix custody keyring name ([#3803](https://github.com/MetaMask/core/pull/3803))

## [12.0.0]

### Changed

- **BREAKING:** Bump `@metamask/preferences-controller` to ^6.0.0

## [11.0.0]

### Changed

- **BREAKING:** Bump `@metamask/preferences-controller` peer dependency from `^5.0.0` to `^5.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695))
- Bump `@metamask/base-controller` to `^4.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695))
- Bump `@metamask/eth-keyring-controller` to `^15.1.0` ([#3617](https://github.com/MetaMask/core/pull/3617))
- Bump `@metamask/eth-sig-util` to `^7.0.1` ([#3614](https://github.com/MetaMask/core/pull/3614))
- Bump `@metamask/message-manager` to `^7.3.7` ([#3695](https://github.com/MetaMask/core/pull/3695))
- Update `forgetQRDevice` to return an object containing `removedAccounts` and `remainingAccounts` ([#3641](https://github.com/MetaMask/core/pull/3641))

### Fixed

- Remove `@metamask/preferences-controller` dependency ([#3607](https://github.com/MetaMask/core/pull/3607))

## [10.0.0]

### Changed

- **BREAKING:** Bump `@metamask/base-controller` to ^4.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
  - This is breaking because the type of the `messenger` has backward-incompatible changes. See the changelog for this package for more.
- Bump `@metamask/message-manager` to ^7.3.6 ([#2063](https://github.com/MetaMask/core/pull/2063))
- Bump `@metamask/preferences-controller` to ^4.5.0 ([#2063](https://github.com/MetaMask/core/pull/2063))

## [9.0.0]

### Added

- Add `KeyringController:persistAllKeyrings` messenger action ([#1965](https://github.com/MetaMask/core/pull/1965))

### Changed

- **BREAKING** Change `encryptor` constructor option property type to `GenericEncryptor | ExportableKeyEncryptor | undefined` ([#2041](https://github.com/MetaMask/core/pull/2041))
  - When the controller is instantiated with `cacheEncryptionKey: true`, `encryptor` may no longer be of type `GenericEncryptor`.
- Bump dependency on `@metamask/scure-bip39` 2.1.1 ([#1868](https://github.com/MetaMask/core/pull/1868))
- Bump dependency on `@metamask/utils` to 8.2.0 ([#1957](https://github.com/MetaMask/core/pull/1957))
- Bump @metamask/eth-keyring-controller to 14.0.0 ([#1771](https://github.com/MetaMask/core/pull/1771))

## [8.1.0]

### Changed

- Adds additional options to KeyringTypes enum ([#1839](https://github.com/MetaMask/core/pull/1839))

## [8.0.3]

### Changed

- `signTransaction` now accepts an optional `opts: Record<string, unknown>` argument to support `signTransaction` from `Keyring` type ([#1789](https://github.com/MetaMask/core/pull/1789))
- Bump dependency and peer dependency on `@metamask/preferences-controller` to ^4.4.3

## [8.0.2]

### Changed

- Bump dependency on `@metamask/utils` to ^8.1.0 ([#1639](https://github.com/MetaMask/core/pull/1639))
- Bump dependency on `@metamask/base-controller` to ^3.2.3
- Bump dependency on `@metamask/message-manager` to ^7.3.5

### Fixed

- Update `removeAccount` to remove call to `PreferencesController.removeIdentity` as `PreferencesController` already handles account removal side effects through messenger events ([#1759](https://github.com/MetaMask/core/pull/1759))

## [8.0.1]

### Changed

- Update TypeScript to v4.8.x ([#1718](https://github.com/MetaMask/core/pull/1718))

### Fixed

- Removed `keyringTypes` from `memStore` ([#1710](https://github.com/MetaMask/core/pull/1710))
  - This property was accidentally getting copied into the memstore from the internal keyring controller. It was causing errors because there is no metadata for this state property.

## [8.0.0]

### Added

- Add `getQRKeyring(): QRKeyring | undefined` method
- Add `KeyringController:qrKeyringStateChange` messenger event
- The event emits updates from the internal `QRKeyring` instance, if there's one

### Changed

- **BREAKING:** addNewKeyring(type) return type changed from Promise<Keyring<Json>> to Promise<unknown>
  - When calling with QRKeyring type the keyring instance is retrieved or created (no multiple QRKeyring instances possible)
- Bump dependency on `@metamask/message-manager` to ^7.3.3
- Bump dependency on `@metamask/preferences-controller` to ^4.4.1

### Fixed

- Fix `addNewAccountForKeyring` for `CustodyKeyring` ([#1694](https://github.com/MetaMask/core/pull/1694))

## [7.5.0]

### Added

- Add `KeyringController` messenger actions ([#1691](https://github.com/MetaMask/core/pull/1691))
  - `KeyringController:getAccounts`
  - `KeyringController:getKeyringsByType`
  - `KeyringController:getKeyringForAccount`

### Changed

- Bump `@metamask/eth-sig-util` from 6.0.0 to 7.0.0 ([#1669](https://github.com/MetaMask/core/pull/1669))

## [7.4.0]

### Added

- Add `KeyringController` messenger actions ([#1654](https://github.com/MetaMask/core/pull/1654))
  - `KeyringController:signMessage`
  - `KeyringController:signPersonalMessage`
  - `KeyringController:signTypedMessage`
  - `KeyringController:decryptMessage`
  - `KeyringController:getEncryptionPublicKey`

## [7.3.0]

### Added

- Add `decryptMessage` method ([#1596](https://github.com/MetaMask/core/pull/1596))

## [7.2.0]

### Added

- Add `addNewAccountForKeyring` method ([#1591](https://github.com/MetaMask/core/pull/1591))
- Add `addNewKeyring` method ([#1594](https://github.com/MetaMask/core/pull/1594))
- Add `persistAllKeyrings` method ([#1574](https://github.com/MetaMask/core/pull/1574))

### Changed

- Bump dependency on `@metamask/base-controller` to ^3.2.1
- Bump dependency on `@metamask/message-manager` to ^7.3.1
- Bump dependency and peer dependency on `@metamask/preferences-controller` to ^4.4.0

## [7.1.0]

### Added

- Add `getEncryptionPublicKey` method on KeyringController ([#1569](https://github.com/MetaMask/core/pull/1569))

## [7.0.0]

### Changed

- **BREAKING**: Remove `keyringTypes` property from the KeyringController state ([#1441](https://github.com/MetaMask/core/pull/1441))
- **BREAKING**: Constructor `KeyringControllerOptions` type changed ([#1441](https://github.com/MetaMask/core/pull/1441))
  - The `KeyringControllerOptions.state` accepted type is now `{ vault?: string }`
  - The `KeyringControllerOptions.keyringBuilders` type is now `{ (): Keyring<Json>; type: string }[]`
- **BREAKING**: The `address` type accepted by the `removeAccount` method is now `Hex` ([#1441](https://github.com/MetaMask/core/pull/1441))
- **BREAKING**: The `signTypedMessage` method now returns a `Promise<string>` ([#1441](https://github.com/MetaMask/core/pull/1441))
- **BREAKING**: The `signTransaction` method now requires a `TypedTransaction` from `@ethereumjs/tx@^4` for the `transaction` argument, and returns a `Promise<TxData>` ([#1441](https://github.com/MetaMask/core/pull/1441))
- **BREAKING:** Rename `Keyring` type to `KeyringObject` ([#1441](https://github.com/MetaMask/core/pull/1441))
- **BREAKING:** `addNewAccount` now throws if address of new account is not a hex string ([#1441](https://github.com/MetaMask/core/pull/1441))
- **BREAKING:** `exportSeedPhrase` now throws if first keyring does not have a mnemonic ([#1441](https://github.com/MetaMask/core/pull/1441))
- **BREAKING:** `verifySeedPhrase` now throws if HD keyring does not have a mnemonic ([#1441](https://github.com/MetaMask/core/pull/1441))
- Update return type of `getAccountKeyringType` to `Promise<string>` ([#1441](https://github.com/MetaMask/core/pull/1441))
- Update `@metamask/eth-keyring-controller` to `^13.0.0` ([#1441](https://github.com/MetaMask/core/pull/1441))
- Update `@metamask/utils` to `^6.2.0` ([#1514](https://github.com/MetaMask/core/pull/1514))
- Update `@ethereumjs/tx` to `^4.2.0` ([#1514](https://github.com/MetaMask/core/pull/1514))
- Update `@ethereumjs/common` to `^3.2.0` ([#1514](https://github.com/MetaMask/core/pull/1514))
- Update `@keystonehq/metamask-airgapped-keyring` to `^0.13.1` ([#1514](https://github.com/MetaMask/core/pull/1514))

## [6.1.0]

### Changed

- Bump @metamask/eth-sig-util to ^6.0.0 ([#1483](https://github.com/MetaMask/core/pull/1483))

## [6.0.0]

### Added

- Add messenger events `KeyringController:lock` and `KeyringController:unlock`, emitted when the inner EthKeyringController is locked/unlocked ([#1378](https://github.com/MetaMask/core/pull/1378))
  - Also add corresponding types `KeyringControllerLockEvent` and `KeyringControllerUnlockEvent`
- Add `KeyringController:accountRemoved` event, fired whenever an account is removed through `removeAccount` ([#1416](https://github.com/MetaMask/core/pull/1416))

### Changed

- **BREAKING:** Update constructor to take a single argument, an options bag, instead of three arguments ([#1378](https://github.com/MetaMask/core/pull/1378))
- **BREAKING:** Update controller so state is now accessible via `controller.state` instead of `controller.store.getState()` ([#1378](https://github.com/MetaMask/core/pull/1378))
- **BREAKING:** Update KeyringController to take a required `messenger` option ([#1378](https://github.com/MetaMask/core/pull/1378))
  - The messenger will now publish `KeyringController:stateChange` on state changes thanks to BaseControllerV2
  - The messenger features a `KeyringController:getState` action thanks to BaseControllerV2
  - Add types `KeyringControllerGetStateAction` and `KeyringControllerStateChangeEvent` for the above
  - Add type `KeyringControllerMessenger`
- **BREAKING:** Update `keyringState` property in the return value of several methods from a type of `KeyringMemState` to `KeyringControllerMemState` ([#1378](https://github.com/MetaMask/core/pull/1378))
  - The affected methods are:
    - `addNewAccount`
    - `addNewAccountWithoutUpdate`
    - `createNewVaultAndRestore`
    - `createNewVaultAndKeychain`
    - `importAccountWithStrategy`
    - `removeAccount`
    - `setLocked`
    - `submitEncryptionKey`
    - `submitPassword`
  - The new type omits `vault`, `encryptionKey`, and `encryptionSalt`
- **BREAKING:** Remove `KeyringState`, `KeyringMemState`, and `KeyringConfig` in favor of new types `KeyringControllerState`, `KeyringControllerMemState`, `KeyringControllerActions`, `KeyringControllerEvents`, and `KeyringControllerOptions` ([#1378](https://github.com/MetaMask/core/pull/1378))
  - `KeyringControllerState` is like the previous `KeyringMemState` but with an extra `vault` property
  - `KeyringControllerMemState` is like the previous `KeyringMemState` but without `encryptionKey` or `encryptionSalt`
  - `KeyringControllerOptions` incorporates the previous set of options and `KeyringConfig`
- Add `immer` as a dependency ([#1378](https://github.com/MetaMask/core/pull/1378))

### Removed

- **BREAKING:** Remove `subscribe` and `unsubscribe` methods ([#1378](https://github.com/MetaMask/core/pull/1378))
  - State changes can be directly subscribed to (or unsubscribed from) via the messenger if necessary
- **BREAKING:** Remove `lock` and `unlock` methods ([#1378](https://github.com/MetaMask/core/pull/1378))
  - `KeyringController:lock` and `KeyringController:unlock` may now be subscribed to via the messenger if necessary
- **BREAKING:** Remove `fullUpdate` method ([#1378](https://github.com/MetaMask/core/pull/1378))
  - There is no need to call this method anymore because the controller should always be up to date with the EthKeyringController instance
- **BREAKING:** Remove `index` from the `Keyring` type ([#1378](https://github.com/MetaMask/core/pull/1378))

## [5.1.0]

### Added

- Add `cancelQRSynchronization` method ([#1387](https://github.com/MetaMask/core.git/pull/1387))

## [5.0.0]

### Added

- Add support for encryption keys ([#1342](https://github.com/MetaMask/core/pull/1342))
  - The configuration option `cacheEncryptionKey` has been added, along with two new state properties (`encryptionKey` and `encryptionSalt`) and a new method (`submitEncryptionKey`)
  - All new state and config entries are optional, so this will have no effect if you're not using this feature.
- Make `addNewAccount` idempotent ([#1298](https://github.com/MetaMask/core/pull/1298))
  - The `addNewAccount` method now takes an optional `accountCount` parameter. If provided, we ensure that this can be called repeatedly with the same result.
- Add deprecated `getKeyringForAccount` and `getKeyringsByType` methods ([#1376](https://github.com/MetaMask/core/pull/1376), [#1386](https://github.com/MetaMask/core/pull/1386))

### Changed

- **BREAKING:** Bump to Node 16 ([#1262](https://github.com/MetaMask/core/pull/1262))
- **BREAKING:** Change return type of `createNewVaultAndRestore` from `string | number[]` to `Uint8Array` ([#1349](https://github.com/MetaMask/core/pull/1349))
- **BREAKING:** Change return type of `verifySeedPhrase` from `string` to `Uint8Array` ([#1338](https://github.com/MetaMask/core/pull/1338))
- **BREAKING:** Replace `validatePassword` with `verifyPassword` ([#1348](https://github.com/MetaMask/core/pull/1348))
  - `verifyPassword` is asynchronous, unlike `validatePassword` which was not.
  - `verifyPassword` does not return a boolean to indicate whether the password is valid. Instead an error is thrown when it's invalid.
- **BREAKING:** `createNewVaultAndKeychain` will now skip vault creation if one already exists, rather than replacing it ([#1324](https://github.com/MetaMask/core/pull/1324))
  - If you do want to replace a vault if one exists, you will have to remove it first before this is called.
- **BREAKING:** `importAccountWithStrategy` and `addNewAccount` no longer update the selected address ([#1296](https://github.com/MetaMask/core/pull/1296), [#1309](https://github.com/MetaMask/core/pull/1309))
  - If you want the newly imported account to be selected, you will have to do that manually after this is called.
- **BREAKING:** Change `importAccountWithStrategy` return type ([#1295](https://github.com/MetaMask/core/pull/1295))
  - `importAccountWithStrategy` now returns an object with `keyringState` and `importedAccountAddress`, rather than just the keyring state.
- **BREAKING:** Change `addNewAccount` return type ([#1294](https://github.com/MetaMask/core/pull/1294))
  - `addNewAccount` now returns an object with `keyringState` and `addedAccountAddress`, rather than just the keyring state.
- **BREAKING:** Add `@metamask/preferences-controller` peer dependency ([#1393](https://github.com/MetaMask/core/pull/1393))
- Bump @metamask/eth-keyring-controller from 10.0.0 to 10.0.1 ([#1280](https://github.com/MetaMask/core/pull/1280))
- Bump @metamask/eth-sig-util from 5.0.2 to 5.0.3 ([#1278](https://github.com/MetaMask/core/pull/1278))
- Update `@metamask/preferences-controller` dependency

### Fixed

- Improve validation of `from` address in `signTypedMessage` ([#1293](https://github.com/MetaMask/core/pull/1293))
- Improve private key validation in `importAccountWithStrategy` ([#1297](https://github.com/MetaMask/core/pull/1297))
  - A more helpful error is now thrown when the given private key has the wrong length
- Keep `vault` state in sync with the internal `EthKeyringController` vault state ([#1384](https://github.com/MetaMask/core/pull/1384))
  - Previously the `vault` state would never be updated after construction, becoming stale as account changes were made
  - The old behavior was especially confusing because the `subscribe` method is overridden to return state change events from the internal `EthKeyingController` state, resulting in state change events being out of sync with controller state. They should be the same now.

## [4.0.0]

### Removed

- **BREAKING:** Remove `isomorphic-fetch` ([#1106](https://github.com/MetaMask/controllers/pull/1106))
  - Consumers must now import `isomorphic-fetch` or another polyfill themselves if they are running in an environment without `fetch`

## [3.0.0]

### Changed

- **BREAKING:**: Bump eth-keyring-controller version to @metamask/eth-keyring-controller v10 ([#1072](https://github.com/MetaMask/core.git/pull/1072))
  - `exportSeedPhrase` now returns a `Uint8Array` typed SRP (can be converted to a string using [this approach](https://github.com/MetaMask/eth-hd-keyring/blob/53b0570559595ba5b3fd8c80e900d847cd6dee3d/index.js#L40)). It was previously a Buffer.
  - The HD keyring included with the keyring controller has been updated from v4 to v6. See [the `eth-hd-keyring` changelog entries for v5 and v6](https://github.com/MetaMask/eth-hd-keyring/blob/main/CHANGELOG.md#600) for further details on breaking changes.

## [2.0.0]

### Changed

- **BREAKING:**: Require ES2020 support or greater ([#914](https://github.com/MetaMask/controllers/pull/914))
  - This change was introduced by an indirect dependency on `ethereumjs/util` v8
- Rename this repository to `core` ([#1031](https://github.com/MetaMask/controllers/pull/1031))
- Update `@metamask/eth-sig-util` to v5 ([#914](https://github.com/MetaMask/controllers/pull/914))
- Update `@metamask/controller-utils` package ([#1041](https://github.com/MetaMask/controllers/pull/1041))

## [1.0.1]

### Changed

- Relax dependencies on `@metamask/base-controller`, `@metamask/controller-utils`, `@metamask/message-manager`, and `@metamask/preferences-controller` (use `^` instead of `~`) ([#998](https://github.com/MetaMask/core/pull/998))

## [1.0.0]

### Added

- Initial release

  - As a result of converting our shared controllers repo into a monorepo ([#831](https://github.com/MetaMask/core/pull/831)), we've created this package from select parts of [`@metamask/controllers` v33.0.0](https://github.com/MetaMask/core/tree/v33.0.0), namely:

    - Everything in `src/keyring`

    All changes listed after this point were applied to this package following the monorepo conversion.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@22.1.0...HEAD
[22.1.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@22.0.2...@metamask/keyring-controller@22.1.0
[22.0.2]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@22.0.1...@metamask/keyring-controller@22.0.2
[22.0.1]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@22.0.0...@metamask/keyring-controller@22.0.1
[22.0.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@21.0.6...@metamask/keyring-controller@22.0.0
[21.0.6]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@21.0.5...@metamask/keyring-controller@21.0.6
[21.0.5]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@21.0.4...@metamask/keyring-controller@21.0.5
[21.0.4]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@21.0.3...@metamask/keyring-controller@21.0.4
[21.0.3]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@21.0.2...@metamask/keyring-controller@21.0.3
[21.0.2]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@21.0.1...@metamask/keyring-controller@21.0.2
[21.0.1]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@21.0.0...@metamask/keyring-controller@21.0.1
[21.0.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@20.0.0...@metamask/keyring-controller@21.0.0
[20.0.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@19.2.2...@metamask/keyring-controller@20.0.0
[19.2.2]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@19.2.1...@metamask/keyring-controller@19.2.2
[19.2.1]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@19.2.0...@metamask/keyring-controller@19.2.1
[19.2.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@19.1.0...@metamask/keyring-controller@19.2.0
[19.1.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@19.0.7...@metamask/keyring-controller@19.1.0
[19.0.7]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@19.0.6...@metamask/keyring-controller@19.0.7
[19.0.6]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@19.0.5...@metamask/keyring-controller@19.0.6
[19.0.5]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@19.0.4...@metamask/keyring-controller@19.0.5
[19.0.4]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@19.0.3...@metamask/keyring-controller@19.0.4
[19.0.3]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@19.0.2...@metamask/keyring-controller@19.0.3
[19.0.2]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@19.0.1...@metamask/keyring-controller@19.0.2
[19.0.1]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@19.0.0...@metamask/keyring-controller@19.0.1
[19.0.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@18.0.0...@metamask/keyring-controller@19.0.0
[18.0.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@17.3.1...@metamask/keyring-controller@18.0.0
[17.3.1]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@17.3.0...@metamask/keyring-controller@17.3.1
[17.3.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@17.2.2...@metamask/keyring-controller@17.3.0
[17.2.2]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@17.2.1...@metamask/keyring-controller@17.2.2
[17.2.1]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@17.2.0...@metamask/keyring-controller@17.2.1
[17.2.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@17.1.2...@metamask/keyring-controller@17.2.0
[17.1.2]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@17.1.1...@metamask/keyring-controller@17.1.2
[17.1.1]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@17.1.0...@metamask/keyring-controller@17.1.1
[17.1.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@17.0.0...@metamask/keyring-controller@17.1.0
[17.0.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@16.1.0...@metamask/keyring-controller@17.0.0
[16.1.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@16.0.0...@metamask/keyring-controller@16.1.0
[16.0.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@15.0.0...@metamask/keyring-controller@16.0.0
[15.0.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@14.0.1...@metamask/keyring-controller@15.0.0
[14.0.1]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@14.0.0...@metamask/keyring-controller@14.0.1
[14.0.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@13.0.0...@metamask/keyring-controller@14.0.0
[13.0.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@12.2.0...@metamask/keyring-controller@13.0.0
[12.2.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@12.1.0...@metamask/keyring-controller@12.2.0
[12.1.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@12.0.0...@metamask/keyring-controller@12.1.0
[12.0.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@11.0.0...@metamask/keyring-controller@12.0.0
[11.0.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@10.0.0...@metamask/keyring-controller@11.0.0
[10.0.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@9.0.0...@metamask/keyring-controller@10.0.0
[9.0.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@8.1.0...@metamask/keyring-controller@9.0.0
[8.1.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@8.0.3...@metamask/keyring-controller@8.1.0
[8.0.3]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@8.0.2...@metamask/keyring-controller@8.0.3
[8.0.2]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@8.0.1...@metamask/keyring-controller@8.0.2
[8.0.1]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@8.0.0...@metamask/keyring-controller@8.0.1
[8.0.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@7.5.0...@metamask/keyring-controller@8.0.0
[7.5.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@7.4.0...@metamask/keyring-controller@7.5.0
[7.4.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@7.3.0...@metamask/keyring-controller@7.4.0
[7.3.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@7.2.0...@metamask/keyring-controller@7.3.0
[7.2.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@7.1.0...@metamask/keyring-controller@7.2.0
[7.1.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@7.0.0...@metamask/keyring-controller@7.1.0
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@6.1.0...@metamask/keyring-controller@7.0.0
[6.1.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@6.0.0...@metamask/keyring-controller@6.1.0
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@5.1.0...@metamask/keyring-controller@6.0.0
[5.1.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@5.0.0...@metamask/keyring-controller@5.1.0
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@4.0.0...@metamask/keyring-controller@5.0.0
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@3.0.0...@metamask/keyring-controller@4.0.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@2.0.0...@metamask/keyring-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@1.0.1...@metamask/keyring-controller@2.0.0
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@1.0.0...@metamask/keyring-controller@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/keyring-controller@1.0.0
