# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [5.0.0]
### Fixed
- Add chain validation to `eth_signTypedData_v4` signature requests ([#1331](https://github.com/MetaMask/core/pull/1331))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/message-manager@5.0.0...HEAD
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
