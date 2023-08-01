# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [5.4.0]

## [5.3.0]
### Added
- Add new methods `setDeferredSignSuccess` and `setDeferredSignError` ([#1506](https://github.com/MetaMask/core/pull/1506))

### Changed
- Update `@metamask/utils` to `^6.2.0` ([#1514](https://github.com/MetaMask/core/pull/1514))

## [5.2.0]
### Added
- Add `messages` getter that returns all messages ([#1469](https://github.com/MetaMask/core/pull/1469))
- Add `setMessageMetadata` method for customizing the metadata for an individual message ([#1469](https://github.com/MetaMask/core/pull/1469))

## [5.1.0]
### Changed
- Report approval success using result callbacks ([#1458](https://github.com/MetaMask/core/pull/1458))

## [5.0.0]
### Added
- **BREAKING** Add sign version to approval message in Signature Controller ([#1440](https://github.com/MetaMask/core/pull/1440))
  - Method `newUnsignedTypedMessage` on the SignatureController now requires a fourth argument: `signingOpts`
  - Method `signMessage` on the SignatureController no longer expects a `version` as a second argument. The second argument is now `signingOpts` which was previously the third argument.

## [4.0.1]
### Fixed
- Remove optional parameter from newUnsignedTypedMessage function ([#1436](https://github.com/MetaMask/core/pull/1436))

## [4.0.0]
### Changed
- **BREAKING:** `newUnsignedXMessage` middlewares now creates and awaits approvals itself. ([#1377](https://github.com/MetaMask/core/pull/1377))

### Removed
- **BREAKING:** Removed `cancelXMessage` and `signXMessage` from public API. ([#1377](https://github.com/MetaMask/core/pull/1377))

## [3.0.0]
### Added
- Add support for deferred signing ([#1364](https://github.com/MetaMask/core/pull/1364))
  - If the parameter `deferSetAsSigned` is set, the message won't be set as signed when the keyring is asked to sign it
- Emit the event `${methodName}:signed` when the keying is asked to sign a message ([#1364](https://github.com/MetaMask/core/pull/1364))
- Add methods  `setTypedMessageInProgress` and `setPersonalMessageInProgress` to set a message status to `inProgress` ([#1339](https://github.com/MetaMask/core/pull/1339))

### Changed
- **BREAKING:** The constructor option `getCurrentChainId` now expects a `Hex` return value rather than `string` ([#1367](https://github.com/MetaMask/core/pull/1367))
- **BREAKING:** Update `@metamask/approval-controller` dependency and add it as a peer dependency ([#1393](https://github.com/MetaMask/core/pull/1393))
- Add `@metamask/utils` dependency ([#1367](https://github.com/MetaMask/core/pull/1367))

## [2.0.0]
### Added
- **BREAKING:** Add `getCurrentChainId` argument to constructor ([#1350](https://github.com/MetaMask/core/pull/1350))

## [1.0.0]
### Added
- Initial release ([#1214](https://github.com/MetaMask/core/pull/1214))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/signature-controller@5.4.0...HEAD
[5.4.0]: https://github.com/MetaMask/core/compare/@metamask/signature-controller@5.3.0...@metamask/signature-controller@5.4.0
[5.3.0]: https://github.com/MetaMask/core/compare/@metamask/signature-controller@5.2.0...@metamask/signature-controller@5.3.0
[5.2.0]: https://github.com/MetaMask/core/compare/@metamask/signature-controller@5.1.0...@metamask/signature-controller@5.2.0
[5.1.0]: https://github.com/MetaMask/core/compare/@metamask/signature-controller@5.0.0...@metamask/signature-controller@5.1.0
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/signature-controller@4.0.1...@metamask/signature-controller@5.0.0
[4.0.1]: https://github.com/MetaMask/core/compare/@metamask/signature-controller@4.0.0...@metamask/signature-controller@4.0.1
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/signature-controller@3.0.0...@metamask/signature-controller@4.0.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/signature-controller@2.0.0...@metamask/signature-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/signature-controller@1.0.0...@metamask/signature-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/signature-controller@1.0.0
