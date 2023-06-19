# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- **BREAKING:** Change return type of `verifySeedPhrase` from `string` to  `Uint8Array` ([#1338](https://github.com/MetaMask/core/pull/1338))
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
  - `exportSeedPhrase` now returns a `Uint8Array` typed SRP (can be converted to a string using [this approach](https://github.com/MetaMask/eth-hd-keyring/blob/53b0570559595ba5b3fd8c80e900d847cd6dee3d/index.js#L40)).  It was previously a Buffer.
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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@6.0.0...HEAD
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@5.1.0...@metamask/keyring-controller@6.0.0
[5.1.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@5.0.0...@metamask/keyring-controller@5.1.0
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@4.0.0...@metamask/keyring-controller@5.0.0
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@3.0.0...@metamask/keyring-controller@4.0.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@2.0.0...@metamask/keyring-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@1.0.1...@metamask/keyring-controller@2.0.0
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@1.0.0...@metamask/keyring-controller@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/keyring-controller@1.0.0
