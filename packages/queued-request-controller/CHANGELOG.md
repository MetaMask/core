# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [11.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/network-controller` to `^24.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))
- **BREAKING:** Bump peer dependency `@metamask/selected-network-controller` to `^23.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))
- Bump `@metamask/base-controller` to `^8.0.1` ([#5722](https://github.com/MetaMask/core/pull/5722))
- Bump `@metamask/controller-utils` to `^11.10.0` ([#5935](https://github.com/MetaMask/core/pull/5935), [#5583](https://github.com/MetaMask/core/pull/5583), [#5765](https://github.com/MetaMask/core/pull/5765), [#5812](https://github.com/MetaMask/core/pull/5812))

## [10.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/network-controller` to `^23.0.0` ([#5507](https://github.com/MetaMask/core/pull/5507))
- **BREAKING:** Bump peer dependency `@metamask/selected-network-controller` to `^22.0.0` ([#5507](https://github.com/MetaMask/core/pull/5507))
- Bump `@metamask/controller-utils` to `^11.5.0` ([#5439](https://github.com/MetaMask/core/pull/5439))
- Bump `@metamask/utils` to `^11.2.0` ([#5301](https://github.com/MetaMask/core/pull/5301))

## [9.0.1]

### Changed

- Bump `@metamask/base-controller` from `^7.1.1` to `^8.0.0` ([#5305](https://github.com/MetaMask/core/pull/5305))
- Bump `@metamask/controller-utils` from `^11.4.5` to `^11.5.0` ([#5272](https://github.com/MetaMask/core/pull/5272))
- Bump `@metamask/utils` from `^11.0.1` to `^11.1.0` ([#5223](https://github.com/MetaMask/core/pull/5223))

## [9.0.0]

### Added

- **BREAKING:** `createQueuedRequestMiddleware` now expects a `useRequestQueue` option ([#5065](https://github.com/MetaMask/core/pull/5065))
  - This was previously removed in 20.0.0, but has been re-added for compatibility with Mobile.

### Changed

- **BREAKING:** Bump peer dependency `@metamask/selected-network-controller` from `^20.0.2` to `^21.0.0` ([#5178](https://github.com/MetaMask/core/pull/5178))
- Bump `@metamask/base-controller` from `^7.0.0` to `^7.1.1` ([#5079](https://github.com/MetaMask/core/pull/5079)), [#5135](https://github.com/MetaMask/core/pull/5135))
- Bump `@metamask/controller-utils` from `^11.4.4` to `^11.4.5` ([#5135](https://github.com/MetaMask/core/pull/5135))
- Bump `@metamask/json-rpc-engine` from `^10.0.1` to `^10.0.2` ([#5082](https://github.com/MetaMask/core/pull/5082))
- Bump `@metamask/rpc-errors` from `^7.0.1` to `^7.0.2` ([#5080](https://github.com/MetaMask/core/pull/5080))
- Bump `@metamask/utils` from `^10.0.0` to `^11.0.1` ([#5080](https://github.com/MetaMask/core/pull/5080))
  - This upgrade is not a breaking change because this package does not use `generateRandomMnemonic`.

## [8.0.2]

### Changed

- Bump `swappable-obj-proxy` from `^2.2.0` to `^2.3.0` ([#5036](https://github.com/MetaMask/core/pull/5036))

## [8.0.1]

### Changed

- Bump `@metamask/controller-utils` from `^11.4.3` to `^11.4.4` ([#5012](https://github.com/MetaMask/core/pull/5012))

## [8.0.0]

### Changed

- **BREAKING:** Bump `@metamask/selected-network-controller` peer dependency from `^19.0.0` to `^20.0.0` ([#4979](https://github.com/MetaMask/core/pull/4979))
- Bump `@metamask/controller-utils` from `^11.4.2` to `^11.4.3` ([#4915](https://github.com/MetaMask/core/pull/4915))

### Removed

- **BREAKING:** `createQueuedRequestMiddleware` no longer takes a `useRequestQueue` parameter. All requests are now queued if `shouldEnqueueRequest(req)` returns true. ([#4941](https://github.com/MetaMask/core/pull/4941))

## [7.0.1]

### Fixed

- Fix issue where `queuedRequestCount` state is not updated after flushing requests for an origin ([#4898](https://github.com/MetaMask/core/pull/4898))

## [7.0.0]

### Added

- **BREAKING:** The `QueuedRequestController` now requires the `canRequestSwitchNetworkWithoutApproval` callback in its constructor params. ([#4846](https://github.com/MetaMask/core/pull/4846))

### Changed

- The `QueuedRequestController` now ensures that a request that can switch the globally selected network without approval is queued behind any existing pending requests. ([#4846](https://github.com/MetaMask/core/pull/4846))

### Fixed

- The `QueuedRequestController` now ensures that any queued requests for a origin are failed if a request that can switch the globally selected network without approval actually does change the globally selected network for that origin. ([#4846](https://github.com/MetaMask/core/pull/4846))

## [6.0.0]

### Changed

- **BREAKING:** Bump `@metamask/network-controller` peer dependency from `^21.0.0` to `^22.0.0` ([#4841](https://github.com/MetaMask/core/pull/4841))
- Bump `@metamask/controller-utils` to `^11.4.0` ([#4834](https://github.com/MetaMask/core/pull/4834))
- Bump `@metamask/rpc-errors` to `^7.0.1` ([#4831](https://github.com/MetaMask/core/pull/4831))
- Bump `@metamask/utils` to `^10.0.0` ([#4831](https://github.com/MetaMask/core/pull/4831))

## [5.1.0]

### Changed

- Batch processing now considers both origin and `networkClientId`, ensuring requests targeting different networks are processed separately. ([#4718](https://github.com/MetaMask/core/pull/4718))
- Incoming requests to `enqueueRequest` now must include a `networkClientId`; an error is thrown if it's missing. This was previously a required part of the type but since consumers like the extension do not have extensive typescript coverage this wasn't definitively enforced. ([#4718](https://github.com/MetaMask/core/pull/4718))

## [5.0.1]

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
- Remove extra slash when constructing user storage url ([#4702](https://github.com/MetaMask/core/pull/4702))

## [5.0.0]

### Changed

- **BREAKING:** Bump devDependency and peerDependency `@metamask/network-controller` from `^20.0.0` to `^21.0.0` ([#4618](https://github.com/MetaMask/core/pull/4618), [#4651](https://github.com/MetaMask/core/pull/4651))
- **BREAKING:** Bump devDependency and peerDependency `@metamask/selected-network-controller` from `^17.0.0` to `^18.0.0` ([#4651](https://github.com/MetaMask/core/pull/4651))
- Bump `@metamask/base-controller` from `^6.0.2` to `^7.0.0` ([#4625](https://github.com/MetaMask/core/pull/4625), [#4643](https://github.com/MetaMask/core/pull/4643))
- Bump `@metamask/controller-utils` from `^11.0.2` to `^11.2.0` ([#4639](https://github.com/MetaMask/core/pull/4639), [#4651](https://github.com/MetaMask/core/pull/4651))
- Bump `typescript` from `~5.0.4` to `~5.2.2` ([#4576](https://github.com/MetaMask/core/pull/4576), [#4584](https://github.com/MetaMask/core/pull/4584))

## [4.0.0]

### Changed

- **BREAKING:** Bump peerDependency `@metamask/selected-network-controller` from `^16.0.0` to `^17.0.0` ([#4548](https://github.com/MetaMask/core/pull/4548))
- Upgrade TypeScript version to `~5.0.4` and set `moduleResolution` option to `Node16` ([#3645](https://github.com/MetaMask/core/pull/3645))
- Bump `@metamask/base-controller` from `^6.0.0` to `^6.0.2` ([#4517](https://github.com/MetaMask/core/pull/4517), [#4544](https://github.com/MetaMask/core/pull/4544))
- Bump `@metamask/controller-utils` from `^11.0.0` to `^11.0.2` ([#4517](https://github.com/MetaMask/core/pull/4517), [#4544](https://github.com/MetaMask/core/pull/4544))
- Bump `@metamask/json-rpc-engine` from `^9.0.0` to `^9.0.2` ([#4517](https://github.com/MetaMask/core/pull/4517), [#4544](https://github.com/MetaMask/core/pull/4544))
- Bump `@metamask/rpc-errors` from `^6.2.1` to `^6.3.1` ([#4516](https://github.com/MetaMask/core/pull/4516))
- Bump `@metamask/utils` from `^8.3.0` to `^9.1.0` ([#4516](https://github.com/MetaMask/core/pull/4516), [#4529](https://github.com/MetaMask/core/pull/4529))

## [3.0.0]

### Changed

- **BREAKING:** Bump peerDependency `@metamask/network-controller` to `^20.0.0` ([#4508](https://github.com/MetaMask/core/pull/4508))
- **BREAKING:** Bump peerDependency `@metamask/selected-network-controller` to `^16.0.0` ([#4508](https://github.com/MetaMask/core/pull/4508))

## [2.0.0]

### Added

- **BREAKING:** `QueuedRequestController` constructor params now requires the `showApprovalRequest` hook that is called when the approval request UI should be opened/focused as the result of a request with confirmation being enqueued ([#4456](https://github.com/MetaMask/core/pull/4456))

## [1.0.0]

### Changed

- **BREAKING:** `QueuedRequestController` constructor no longer accepts the `methodsRequiringNetworkSwitch` array param. It's now replaced with the `shouldRequestSwitchNetwork` function param which should return true when a request requires the globally selected network to match that of the dapp from which the request originated. ([#4423](https://github.com/MetaMask/core/pull/4423))
- **BREAKING:** `createQueuedRequestMiddleware` no longer accepts the `methodsWithConfirmation` array typed param. It's now replaced with the `shouldEnqueueRequest` function typed param which should return true when a request should be handled by the `QueuedRequestController`. ([#4423](https://github.com/MetaMask/core/pull/4423))

## [0.12.0]

### Changed

- **BREAKING:** Bump minimum Node version to 18.18 ([#3611](https://github.com/MetaMask/core/pull/3611))
- **BREAKING:** Bump peer dependency `@metamask/network-controller` to `^19.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- **BREAKING:** Bump peer dependency `@metamask/selected-network-controller` to `^15.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- Bump `@metamask/base-controller` to `^6.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- Bump `@metamask/controller-utils` to `^11.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- Bump `@metamask/json-rpc-engine` to `^9.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))

## [0.11.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/network-controller` to `^18.1.3` ([#4342](https://github.com/MetaMask/core/pull/4342))
- **BREAKING:** Bump dependency and peer dependency `@metamask/selected-network-controller` to `^14.0.0` ([#4342](https://github.com/MetaMask/core/pull/4342))
- Bump `@metamask/controller-utils` to `^10.0.0` ([#4342](https://github.com/MetaMask/core/pull/4342))

## [0.10.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/selected-network-controller` to `^13.0.0` ([#4260](https://github.com/MetaMask/core/pull/4260))
- Bump `@metamask/json-rpc-engine` to `^8.0.2` ([#4234](https://github.com/MetaMask/core/pull/4234))
- Bump `@metamask/base-controller` to `^5.0.2` ([#4232](https://github.com/MetaMask/core/pull/4232))

## [0.9.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/selected-network-controller` to `^12.0.0` ([#4173](https://github.com/MetaMask/core/pull/4173))

## [0.8.0]

### Added

- **BREAKING**: The `QueuedRequestMiddleware` constructor now requires the `methodsWithConfirmation` param which should be a list of methods that can trigger confirmations ([#4066](https://github.com/MetaMask/core/pull/4066))
- **BREAKING**: The `QueuedRequestController` constructor now requires the `methodsRequiringNetworkSwitch` param which should be a list of methods that need the globally selected network to switched to the dapp selected network before being processed ([#4066](https://github.com/MetaMask/core/pull/4066))
- **BREAKING**: Clear pending confirmations (for both queued and non-queued requests) after processing revokePermissions. We now require a function to be passed into the constructor (`clearPendingConfirmations`) which will be called when permissions are revoked for a domain who currently has pending confirmations that are not queued. This is done by piggybacking on `SelectedNetworkController:stateChange` in order to serve as a proxy for permissions being revoked. ([#4165](https://github.com/MetaMask/controllers/pull/4165))
- **BREAKING**: The QueuedRequestController will now flush the RequestQueue after a dapp switches networks. QueuedRequestController now requires a subscription on `SelectedNetworkController:stateChange`, and upon receiving stateChanges for adding or replacing selectedNetworkController.state.domains, we flush the queue for the domain in question. ([#4139](https://github.com/MetaMask/controllers/pull/4139))

### Changed

- **BREAKING**: `QueuedRequestController.enqueueRequest()` now ensures the globally selected network matches the dapp selected network before processing methods listed in the `methodsRequiringNetworkSwitch` constructor param. This replaces the previous behavior of switching for all methods except `eth_requestAccounts`. ([#4066](https://github.com/MetaMask/core/pull/4066))

## [0.7.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/selected-network-controller` to `^11.0.0` ([#4121](https://github.com/MetaMask/core/pull/4121))
- Bump `@metamask/controller-utils` to `^9.0.2` ([#4065](https://github.com/MetaMask/core/pull/4065))

## [0.6.1]

### Fixed

- Fix `types` field in `package.json` ([#4047](https://github.com/MetaMask/core/pull/4047))

## [0.6.0]

### Added

- **BREAKING**: Add ESM build ([#3998](https://github.com/MetaMask/core/pull/3998))
  - It's no longer possible to import files from `./dist` directly.
- Export `QueuedRequestControllerGetStateAction` and `QueuedRequestControllerStateChangeEvent` ([#3984](https://github.com/MetaMask/core/pull/3984))

### Changed

- **BREAKING**: The `QueuedRequestController` will now batch queued requests by origin ([#3781](https://github.com/MetaMask/core/pull/3781), [#4038](https://github.com/MetaMask/core/pull/4038))
  - All of the requests in a single batch will be processed in parallel.
  - Requests get processed in order of insertion, even across origins/batches.
  - All requests get processed even in the event of preceding requests failing.
- **BREAKING:** The `queuedRequestCount` state no longer includes requests that are currently being processed; it just counts requests that are queued ([#3781](https://github.com/MetaMask/core/pull/3781))
- **BREAKING:** The `QueuedRequestController` no longer triggers a confirmation when a network switch is needed ([#3781](https://github.com/MetaMask/core/pull/3781))
  - The network switch now happens automatically, with no confirmation.
  - A new `QueuedRequestController:networkSwitched` event has been added to communicate when this has happened.
  - The `QueuedRequestController` messenger no longer needs access to the actions `NetworkController:getNetworkConfigurationByNetworkClientId` and `ApprovalController:addRequest`.
  - The package `@metamask/approval-controller` has been completely removed as a dependency
- **BREAKING:** The `QueuedRequestController` method `enqueueRequest` is now responsible for switching the network before processing a request, rather than the `QueuedRequestMiddleware` ([#3968](https://github.com/MetaMask/core/pull/3968))
  - Functionally the behavior is the same: before processing each request, we compare the request network client with the current selected network client, and we switch the current selected network client if necessary.
  - The `QueuedRequestController` messenger now requires four additional allowed actions:
    - `NetworkController:getState`
    - `NetworkController:setActiveNetwork`
    - `NetworkController:getNetworkConfigurationByNetworkClientId`
    - `ApprovalController:addRequest`
  - The `QueuedRequestController` method `enqueueRequest` now takes one additional parameter, the request object.
  - `createQueuedRequestMiddleware` no longer takes a controller messenger; instead it takes the `enqueueRequest` method from `QueuedRequestController` as a parameter.
- **BREAKING**: Remove the `QueuedRequestController:countChanged` event ([#3985](https://github.com/MetaMask/core/pull/3985))
  - The number of queued requests is now tracked in controller state, as the `queuedRequestCount` property. Use the `QueuedRequestController:stateChange` event to be notified of count changes instead.
- **BREAKING**: Remove the `length` method ([#3985](https://github.com/MetaMask/core/pull/3985))
  - The number of queued requests is now tracked in controller state, as the `queuedRequestCount` property.
- **BREAKING:** Bump `@metamask/base-controller` to `^5.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
  - This version has a number of breaking changes. See the changelog for more.
- **BREAKING:** Bump peer dependency on `@metamask/network-controller` to `^18.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
- **BREAKING:** Bump peer dependency on `@metamask/selected-network-controller` to `^10.0.0` ([#3996](https://github.com/MetaMask/core/pull/3996))
- Bump `@metamask/controller-utils` to `^9.0.0` ([#4007](https://github.com/MetaMask/core/pull/4007))
- Bump `@metamask/json-rpc-engine` to `^8.0.0` ([#4007](https://github.com/MetaMask/core/pull/4007))
- Bump `@metamask/rpc-errors` to `^6.2.1` ([#3970](https://github.com/MetaMask/core/pull/3970))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/queued-request-controller@11.0.0...HEAD
[11.0.0]: https://github.com/MetaMask/core/compare/@metamask/queued-request-controller@10.0.0...@metamask/queued-request-controller@11.0.0
[10.0.0]: https://github.com/MetaMask/core/compare/@metamask/queued-request-controller@9.0.1...@metamask/queued-request-controller@10.0.0
[9.0.1]: https://github.com/MetaMask/core/compare/@metamask/queued-request-controller@9.0.0...@metamask/queued-request-controller@9.0.1
[9.0.0]: https://github.com/MetaMask/core/compare/@metamask/queued-request-controller@8.0.2...@metamask/queued-request-controller@9.0.0
[8.0.2]: https://github.com/MetaMask/core/compare/@metamask/queued-request-controller@8.0.1...@metamask/queued-request-controller@8.0.2
[8.0.1]: https://github.com/MetaMask/core/compare/@metamask/queued-request-controller@8.0.0...@metamask/queued-request-controller@8.0.1
[8.0.0]: https://github.com/MetaMask/core/compare/@metamask/queued-request-controller@7.0.1...@metamask/queued-request-controller@8.0.0
[7.0.1]: https://github.com/MetaMask/core/compare/@metamask/queued-request-controller@7.0.0...@metamask/queued-request-controller@7.0.1
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/queued-request-controller@6.0.0...@metamask/queued-request-controller@7.0.0
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/queued-request-controller@5.1.0...@metamask/queued-request-controller@6.0.0
[5.1.0]: https://github.com/MetaMask/core/compare/@metamask/queued-request-controller@5.0.1...@metamask/queued-request-controller@5.1.0
[5.0.1]: https://github.com/MetaMask/core/compare/@metamask/queued-request-controller@5.0.0...@metamask/queued-request-controller@5.0.1
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/queued-request-controller@4.0.0...@metamask/queued-request-controller@5.0.0
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/queued-request-controller@3.0.0...@metamask/queued-request-controller@4.0.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/queued-request-controller@2.0.0...@metamask/queued-request-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/queued-request-controller@1.0.0...@metamask/queued-request-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/compare/@metamask/queued-request-controller@0.12.0...@metamask/queued-request-controller@1.0.0
[0.12.0]: https://github.com/MetaMask/core/compare/@metamask/queued-request-controller@0.11.0...@metamask/queued-request-controller@0.12.0
[0.11.0]: https://github.com/MetaMask/core/compare/@metamask/queued-request-controller@0.10.0...@metamask/queued-request-controller@0.11.0
[0.10.0]: https://github.com/MetaMask/core/compare/@metamask/queued-request-controller@0.9.0...@metamask/queued-request-controller@0.10.0
[0.9.0]: https://github.com/MetaMask/core/compare/@metamask/queued-request-controller@0.8.0...@metamask/queued-request-controller@0.9.0
[0.8.0]: https://github.com/MetaMask/core/compare/@metamask/queued-request-controller@0.7.0...@metamask/queued-request-controller@0.8.0
[0.7.0]: https://github.com/MetaMask/core/compare/@metamask/queued-request-controller@0.6.1...@metamask/queued-request-controller@0.7.0
[0.6.1]: https://github.com/MetaMask/core/compare/@metamask/queued-request-controller@0.6.0...@metamask/queued-request-controller@0.6.1
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
