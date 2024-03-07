# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.0]

### Added

- Export `QueuedRequestControllerGetStateAction` and `QueuedRequestControllerStateChangeEvent` ([#3984](https://github.com/MetaMask/core/pull/3984))

### Changed

- **BREAKING:** Bump `@metamask/selected-network-controller` peer dependency to `^9.0.0` ([#3996](https://github.com/MetaMask/core/pull/3996))
- **BREAKING**: Remove the `QueuedRequestController:countChanged` event ([#3985](https://github.com/MetaMask/core/pull/3985))
  - The number of queued requests is now tracked in controller state, as the `queuedRequestCount` property. Use the `QueuedRequestController:stateChange` event to be notified of count changes instead.
- **BREAKING**: Remove the `length` method ([#3985](https://github.com/MetaMask/core/pull/3985))
  - The number of queued requests is now tracked in controller state, as the `queuedRequestCount` property.
- **BREAKING:** The `QueuedRequestController` method `enqueueRequest` is now responsible for switching the network before processing a request, rather than the `QueuedRequestMiddleware` ([#3986](https://github.com/MetaMask/core/pull/3986))
  - Functionally the behavior is the same: before processing each request, we compare the request network client with the current selected network client, and we switch the current selected network client if necessary.
  - The `QueuedRequestController` messenger has four additional allowed actions:
    - `NetworkController:getState`
    - `NetworkController:setActiveNetwork`
    - `NetworkController:getNetworkConfigurationByNetworkClientId`
    - `ApprovalController:addRequest`
  - The `QueuedRequestController` method `enqueueRequest` now takes one additional parameter, the request object
  - The `QueuedRequestMiddleware` no longer has a controller messenger. Instead it takes the `enqueueRequest` method as a parameter.
- Bump `@metamask/rpc-errors` from `^6.2.0` to `^6.2.1` ([#3970](https://github.com/MetaMask/core/pull/3970))

## [0.5.0]

### Added

- Add `queuedRequestCount` state ([#3919](https://github.com/MetaMask/core/pull/3919))

### Changed

- **BREAKING:** Bump `@metamask/selected-network-controller` peer dependency to `^8.0.0` ([#3958](https://github.com/MetaMask/core/pull/3958))
- Deprecate the `length` method in favor of the `queuedRequestCount` state ([#3919](https://github.com/MetaMask/core/pull/3919))
- Deprecate the `countChanged` event in favor of the `stateChange` event ([#3919](https://github.com/MetaMask/core/pull/3919))

## [0.4.0]

### Changed

- **BREAKING:** Bump `@metamask/approval-controller` peer dependency to `^5.1.2` ([#3821](https://github.com/MetaMask/core/pull/3821))
- **BREAKING:** Bump `@metamask/network-controller` peer dependency to `^17.2.0` ([#3821](https://github.com/MetaMask/core/pull/3821))
- **BREAKING:** Bump `@metamask/selected-network-controller` peer dependency to `^7.0.0` ([#3821](https://github.com/MetaMask/core/pull/3821))
- The action `NetworkController:setProviderType` is no longer used, so it's no longer required by the `QueuedRequestController` messenger ([#3807](https://github.com/MetaMask/core/pull/3807))
- Bump `@metamask/swappable-obj-proxy` to `^2.2.0` ([#3784](https://github.com/MetaMask/core/pull/3784))
- Bump `@metamask/utils` to `^8.3.0` ([#3769](https://github.com/MetaMask/core/pull/3769))
- Bump `@metamask/base-controller` to `^4.1.1` ([#3760](https://github.com/MetaMask/core/pull/3760), [#3821](https://github.com/MetaMask/core/pull/3821))
- Bump `@metamask/controller-utils` to `^8.0.2` ([#3821](https://github.com/MetaMask/core/pull/3821))
- Bump `@metamask/json-rpc-engine` to `^7.3.2` ([#3821](https://github.com/MetaMask/core/pull/3821))

## [0.3.0]

### Added

- Add `QueuedRequestMiddlewareJsonRpcRequest` type ([#1970](https://github.com/MetaMask/core/pull/1970)).

### Changed

- **BREAKING:** `QueuedRequestControllerMessenger` can no longer be defined with any allowed actions or events ([#1970](https://github.com/MetaMask/core/pull/1970)).
- **BREAKING:** Add `@metamask/approval-controller` as dependency and peer dependency ([#1970](https://github.com/MetaMask/core/pull/1970), [#3695](https://github.com/MetaMask/core/pull/3695), [#3680](https://github.com/MetaMask/core/pull/3680))
- **BREAKING:** Bump `@metamask/network-controller` dependency and peer dependency from `^17.0.0` to `^17.1.0` ([#3695](https://github.com/MetaMask/core/pull/3695))
- **BREAKING:** Bump `@metamask/selected-network-controller` dependency and peer dependency from `^4.0.0` to `^6.1.0` ([#3695](https://github.com/MetaMask/core/pull/3695), [#3603](https://github.com/MetaMask/core/pull/3603))
- Bump `@metamask/base-controller` to `^4.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695))
- Bump `@metamask/controller-utils` to `^8.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695), [#3678](https://github.com/MetaMask/core/pull/3678), [#3667](https://github.com/MetaMask/core/pull/3667), [#3580](https://github.com/MetaMask/core/pull/3580))
- Bump `@metamask/base-controller` to `^4.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695))

### Fixed

- Remove `@metamask/approval-controller`, `@metamask/network-controller`, and `@metamask/selected-network-controller` dependencies ([#3607](https://github.com/MetaMask/core/pull/3607))

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

- Add missing methods that require confirmation ([#1955](https://github.com/MetaMask/core/pull/1955))

## [0.1.0]

### Added

- Initial release

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/queued-request-controller@0.6.0...HEAD
[0.6.0]: https://github.com/MetaMask/core/compare/@metamask/queued-request-controller@0.5.0...@metamask/queued-request-controller@0.6.0
[0.5.0]: https://github.com/MetaMask/core/compare/@metamask/queued-request-controller@0.4.0...@metamask/queued-request-controller@0.5.0
[0.4.0]: https://github.com/MetaMask/core/compare/@metamask/queued-request-controller@0.3.0...@metamask/queued-request-controller@0.4.0
[0.3.0]: https://github.com/MetaMask/core/compare/@metamask/queued-request-controller@0.2.0...@metamask/queued-request-controller@0.3.0
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/queued-request-controller@0.1.4...@metamask/queued-request-controller@0.2.0
[0.1.4]: https://github.com/MetaMask/core/compare/@metamask/queued-request-controller@0.1.3...@metamask/queued-request-controller@0.1.4
[0.1.3]: https://github.com/MetaMask/core/compare/@metamask/queued-request-controller@0.1.2...@metamask/queued-request-controller@0.1.3
[0.1.2]: https://github.com/MetaMask/core/compare/@metamask/queued-request-controller@0.1.1...@metamask/queued-request-controller@0.1.2
[0.1.1]: https://github.com/MetaMask/core/compare/@metamask/queued-request-controller@0.1.0...@metamask/queued-request-controller@0.1.1
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/queued-request-controller@0.1.0
