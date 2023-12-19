# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Added
- Add `QueuedRequestMiddlewareJsonRpcRequest` type ([#1970](https://github.com/MetaMask/core/pull/1970)).

### Changed
- **BREAKING:** `QueuedRequestControllerMessenger` can no longer be defined with any allowed actions or events ([#1970](https://github.com/MetaMask/core/pull/1970)).
- Move `@metamask/approval-controller` from devDependency to dependency ([#1970](https://github.com/MetaMask/core/pull/1970)).

### Fixed
- Recategorize `@metamask/approval-controller`, `@metamask/network-controller`, `@metamask/selected-network-controller` as dev dependencies ([#3607](https://github.com/MetaMask/core/pull/3607))

## [0.2.0]
### Changed
- **BREAKING:** Bump `@metamask/base-controller` to ^4.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
  - This is breaking because the type of the `messenger` has backward-incompatible changes. See the changelog for this package for more.
- Bump `@metamask/controller-utils` to ^6.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
- Bump `@metamask/network-controller` to ^17.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
- Bump `@metamask/selected-network-controller` to ^4.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))

## [0.1.4]
### Changed
- **BREAKING:** Bump dependency and peer dependency on `@metamask/network-controller` to ^16.0.0
- Bump dependency and peer dependency on `@metamask/selected-network-controller` to ^3.1.2

## [0.1.3]
### Changed
- Bump dependency on @metamask/json-rpc-engine to ^7.2.0 ([#1895](https://github.com/MetaMask/core/pull/1895))
- Bump @metamask/utils from 8.1.0 to 8.2.0 ([#1957](https://github.com/MetaMask/core/pull/1957))

### Fixed
- Fixes an issue in the extension when 'useRequestQueue' is enabled. The problem occurred when a DApp's selected network differed from the globally selected network, and when the DApp's chosen network was not a built-in network. Under these conditions, the nickname would not be displayed in the 'toNetworkConfiguration' parameter passed to the `addApproval` function ([#2000](https://github.com/MetaMask/core/pull/2000)).
- Fixes an issue in the extension when 'useRequestQueue' is activated. Previously, when invoking 'wallet_addEthereumChain', if the DApp's selected network was different from the globally selected network, the user was incorrectly prompted to switch the Ethereum chain prior to the 'addEthereumChain' request. With this update, 'addEthereumChain' will still be queued (due to its confirmation requirement), but the unnecessary chain switch prompt has been eliminated ([#2000](https://github.com/MetaMask/core/pull/2000)).

## [0.1.2]
### Fixed
- Fix issue where switching chain would ultimately fail due to the wrong `networkClientId` / `type` ([#1962](https://github.com/MetaMask/core/pull/1962))

## [0.1.1]
### Fixed
-  Add missing methods that require confirmation ([#1955](https://github.com/MetaMask/core/pull/1955))

## [0.1.0]
### Added
- Initial release

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/queued-request-controller@0.2.0...HEAD
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/queued-request-controller@0.1.4...@metamask/queued-request-controller@0.2.0
[0.1.4]: https://github.com/MetaMask/core/compare/@metamask/queued-request-controller@0.1.3...@metamask/queued-request-controller@0.1.4
[0.1.3]: https://github.com/MetaMask/core/compare/@metamask/queued-request-controller@0.1.2...@metamask/queued-request-controller@0.1.3
[0.1.2]: https://github.com/MetaMask/core/compare/@metamask/queued-request-controller@0.1.1...@metamask/queued-request-controller@0.1.2
[0.1.1]: https://github.com/MetaMask/core/compare/@metamask/queued-request-controller@0.1.0...@metamask/queued-request-controller@0.1.1
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/queued-request-controller@0.1.0
