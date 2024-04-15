# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@14.0.1...HEAD
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
