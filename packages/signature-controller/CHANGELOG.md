# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/signature-controller@4.0.0...HEAD
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/signature-controller@3.0.0...@metamask/signature-controller@4.0.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/signature-controller@2.0.0...@metamask/signature-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/signature-controller@1.0.0...@metamask/signature-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/signature-controller@1.0.0
