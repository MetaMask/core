# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [7.0.2]
### Fixed
- Avoid race condition when creating typed messages ([#1467](https://github.com/MetaMask/core/pull/1467))

## [7.0.1]
### Fixed
- eth_signTypedData_v4 and v3 should take an object as well as string for data parameter. ([#1438](https://github.com/MetaMask/core/pull/1438))

## [7.0.0]
### Added
- Added `waitForFinishStatus` to `AbstractMessageManager` which is waiting for the message to be proccesed and resolve. ([#1377](https://github.com/MetaMask/core/pull/1377))

### Changed
- **BREAKING:** Removed `addUnapprovedMessageAsync` methods from `PersonalMessageManager`, `TypedMessageManager` and `MessageManager` because it's not consumed by `SignatureController` anymore. ([#1377](https://github.com/MetaMask/core/pull/1377))

## [6.0.0]
### Added
- Add `getAllMessages` and `setMetadata` methods to message managers ([#1364](https://github.com/MetaMask/core/pull/1364))
  - A new optional `metadata` property has been added to the message type as well
- Add support for deferred signing ([#1364](https://github.com/MetaMask/core/pull/1364))
  - `deferSetAsSigned` has been added as a message parameter. This is used to tell the signature controller to not mark this message as signed when the keyring is asked to sign it.
- Add the `setMessageStatusInProgress` method to set a message status to `inProgress` ([#1339](https://github.com/MetaMask/core/pull/1339))

### Changed
- **BREAKING:** The `getCurrentChainId` constructor parameter for each message manager now expects a `Hex` return type rather than a decimal string ([#1367](https://github.com/MetaMask/core/pull/1367))
  - Note that while every message manager class accepts this as a constructor parameter, it's only used by the `TypedMessageManager` at the moment
- Add `@metamask/utils` dependency ([#1370](https://github.com/MetaMask/core/pull/1370))

## [5.0.0]
### Fixed
- **BREAKING:** Add chain validation to `eth_signTypedData_v4` signature requests ([#1331](https://github.com/MetaMask/core/pull/1331))

## [4.0.0]
### Changed
- **BREAKING:** Change type of `securityProviderResponse` to `Record` ([#1214](https://github.com/MetaMask/core/pull/1214))
- **BREAKING:** Update to Node 16 ([#1262](https://github.com/MetaMask/core/pull/1262))

## [3.1.1]
### Fixed
- Ensure message updates get saved in state even when they aren't emitted right away  ([#1245](https://github.com/MetaMask/core/pull/1245))
  - The `updateMessage` method included in each message manager accepted an `emitUpdate` boolean argument that would enable to caller to prevent that update from updating the badge (which displays the count of pending confirmations). Unfortunately this option would also prevent the update from being saved in state.
  - This method has been updated to ensure message updates are saved in state, even when the badge update event is suppressed

## [3.1.0]
### Added
- Add DecryptMessageManager ([#1149](https://github.com/MetaMask/core/pull/1149))

## [3.0.0]
### Added
- Add EncryptionPublicKeyManager ([#1144](https://github.com/MetaMask/core/pull/1144))
- Add security provider request to AbstractMessageManager ([#1145](https://github.com/MetaMask/core/pull/1145))

### Changed
- **BREAKING:** The methods `addMessage` and `addUnapprovedMessage` on each "message manager" controller are now asynchronous ([#1145](https://github.com/MetaMask/core/pull/1145))

## [2.1.0]
### Added
- Add SIWE detection support for PersonalMessageManager ([#1139](https://github.com/MetaMask/core/pull/1139))

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
    - Everything in `src/message-manager`
    - Message manager-related functions in `src/util.ts` and accompanying tests

    All changes listed after this point were applied to this package following the monorepo conversion.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/message-manager@7.0.2...HEAD
[7.0.2]: https://github.com/MetaMask/core/compare/@metamask/message-manager@7.0.1...@metamask/message-manager@7.0.2
[7.0.1]: https://github.com/MetaMask/core/compare/@metamask/message-manager@7.0.0...@metamask/message-manager@7.0.1
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/message-manager@6.0.0...@metamask/message-manager@7.0.0
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/message-manager@5.0.0...@metamask/message-manager@6.0.0
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/message-manager@4.0.0...@metamask/message-manager@5.0.0
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/message-manager@3.1.1...@metamask/message-manager@4.0.0
[3.1.1]: https://github.com/MetaMask/core/compare/@metamask/message-manager@3.1.0...@metamask/message-manager@3.1.1
[3.1.0]: https://github.com/MetaMask/core/compare/@metamask/message-manager@3.0.0...@metamask/message-manager@3.1.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/message-manager@2.1.0...@metamask/message-manager@3.0.0
[2.1.0]: https://github.com/MetaMask/core/compare/@metamask/message-manager@2.0.0...@metamask/message-manager@2.1.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/message-manager@1.0.2...@metamask/message-manager@2.0.0
[1.0.2]: https://github.com/MetaMask/core/compare/@metamask/message-manager@1.0.1...@metamask/message-manager@1.0.2
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/message-manager@1.0.0...@metamask/message-manager@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/message-manager@1.0.0
