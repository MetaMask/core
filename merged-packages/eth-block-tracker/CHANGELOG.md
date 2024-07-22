# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [11.0.0]
### Changed
- **BREAKING**: Adapt to EIP-1193 provider changes by using `request` method of provider instead of `sendAsync` ([#252](https://github.com/MetaMask/eth-block-tracker/pull/252))
  - This change included in `10.1.0` was mistakenly categorised as a non-breaking change.
  - This requires provider object to have the `request` method. You need to upgrade to minimum `4.1.0` of `@metamask/eth-json-rpc-provider` so that the `request` method is available.

## [10.1.0] [DEPRECATED]
### Changed
- Adapt to EIP-1193 provider changes ([#252](https://github.com/MetaMask/eth-block-tracker/pull/252))
  - Deprecated `sendAsync` method is replaced with `request` method
- Bump `@metamask/eth-json-rpc-provider` from `^4.0.0` to `^4.1.0` ([#252](https://github.com/MetaMask/eth-block-tracker/pull/252))

## [10.0.0]
### Changed
- BREAKING: Drop support for Node.js v16; add support for Node.js v20, v22 ([#245](https://github.com/MetaMask/eth-block-tracker/pull/245))
- Update `@metamask/eth-json-rpc-provider` from `^3.0.2` to `^4.0.0` ([#247](https://github.com/MetaMask/eth-block-tracker/pull/247))

## [9.0.3]
### Fixed
- Update dependency `@metamask/eth-json-rpc-engine` from `^7.1.1` to `^8.0.2` ([#235](https://github.com/MetaMask/eth-block-tracker/pull/235))
- Update dependency `@metamask/eth-json-rpc-provider` from `^2.3.1` to `^3.0.2` ([#235](https://github.com/MetaMask/eth-block-tracker/pull/235))

## [9.0.2]
### Fixed
- Put back missing empty `params` to `eth_blockNumber` call removed in 9.0.1 ([#198](https://github.com/MetaMask/eth-block-tracker/pull/198))

## [9.0.1]
### Fixed
- Concurrency fix: Prevent multiple simultaneous polling loops ([#208](https://github.com/MetaMask/eth-block-tracker/pull/208))
- Bump `@metamask/eth-json-rpc-provider` from `^2.1.0` to `^2.3.1` ([#198](https://github.com/MetaMask/eth-block-tracker/pull/198)) ([#217](https://github.com/MetaMask/eth-block-tracker/pull/217))

## [9.0.0]
### Changed
- Rename package from `eth-block-tracker` to `@metamask/eth-block-tracker` ([#183](https://github.com/MetaMask/eth-block-tracker/pull/183))

## [8.1.0]
### Changed
- Typescript: Add `checkForLatestBlock` function to `BlockTracker` interface ([#184](https://github.com/MetaMask/eth-block-tracker/pull/184))

## [8.0.0]
### Changed
- Bump @metamask/utils from ^5.0.2 to ^8.1.0 ([#178](https://github.com/MetaMask/eth-block-tracker/pull/178))
- **BREAKING**: Bump @metamask/eth-json-rpc-provider from ^1.0.0 to ^2.1.0 ([#174](https://github.com/MetaMask/eth-block-tracker/pull/174))
- **BREAKING**: Increase minimum Node.js version to 16 ([#173](https://github.com/MetaMask/eth-block-tracker/pull/173))

## [7.2.0]
### Added
- Typescript: Export `BlockTracker` interface ([#168](https://github.com/MetaMask/eth-block-tracker/pull/168))

### Changed
- Dependency Updates: ([#165](https://github.com/MetaMask/eth-block-tracker/pull/165))
  - Bump pify from ^3.0.0 to ^5.0.0
  - Bump @metamask/utils from ^5.0.1 to ^5.0.2

## [7.1.0]
### Added
- Add `usePastBlocks` to constructor ([#151](https://github.com/MetaMask/eth-block-tracker/pull/151))
  - Optional flag. When set to true, it allows blocks less than the current block number to be cached and returned.

## [7.0.1]
### Changed
- Dependency updates:
  - Bump @metamask/utils from 5.0.1 to 5.0.2
    - [#141](https://github.com/MetaMask/eth-block-tracker/pull/141)
    - [#144](https://github.com/MetaMask/eth-block-tracker/pull/144)
  - Bump @metamask/safe-event-emitter from 2.0.0 to 3.0.0 ([#143](https://github.com/MetaMask/eth-block-tracker/pull/143))

## [7.0.0]
### Changed
- **BREAKING:** The type of the `provider` option for `PollingBlockTracker` and `SubscribeBlockTracker` has changed ([#130](https://github.com/MetaMask/eth-block-tracker/pull/130))
  - The `provider` option must be compatible with the `SafeEventEmitterProvider` type from `@metamask/eth-json-rpc-middleware`.
  - The new provider type should be mostly equivalent, except that it's now expected to have a `send` method. We don't use that `send` method in this package though.

### Removed
- **BREAKING:** Remove the `Provider` exported type ([#130](https://github.com/MetaMask/eth-block-tracker/pull/130))
  - We now use `@metamask/eth-json-rpc-provider` for this instead, so there was no need to re-export it.

## [6.1.0]
### Added
- Add back Provider type that was accidentally removed in 6.0.0 ([#117](https://github.com/MetaMask/eth-block-tracker/pull/117))

### Fixed
- Align Provider type with `eth-json-rpc-middleware` to prevent typecasting ([#117](https://github.com/MetaMask/eth-block-tracker/pull/117))

## [6.0.0]
### Added
- Add logging ([#112](https://github.com/MetaMask/eth-block-tracker/pull/112))
  - You will not be able to see log messages by default, but you can turn them on for this library by setting the `DEBUG` environment variable to `metamask:eth-block-tracker:*` or `metamask:*`.
- Add `destroy` method to block tracker classes ([#106](https://github.com/MetaMask/eth-block-tracker/pull/106))
- Update PollingBlockTracker to support new `blockResetDuration` option ([#103](https://github.com/MetaMask/eth-block-tracker/pull/103))
- Expose types that represent options to PollingBlockTracker and SubscribeBlockTracker constructors ([#103](https://github.com/MetaMask/eth-block-tracker/pull/103))

### Changed
- **BREAKING:** Require Node >= 14 ([#113](https://github.com/MetaMask/eth-block-tracker/pull/113))
- **BREAKING:** Make BaseBlockTracker abstract ([#103](https://github.com/MetaMask/eth-block-tracker/pull/103))
  - If you are using this class directly, you must only use PollingBlockTracker or SubscribeBlockTracker.
- **BREAKING:** Make options for BaseBlockTracker required ([#103](https://github.com/MetaMask/eth-block-tracker/pull/103))
  - Subclasses must pass a set of options to `super` in their constructors.
- Make argument to `removeAllListeners` in BaseBlockTracker optional ([#103](https://github.com/MetaMask/eth-block-tracker/pull/103))
- **BREAKING:** Update signatures for `_start` and `_end` in BaseBlockTracker ([#103](https://github.com/MetaMask/eth-block-tracker/pull/103))
  - Subclasses must provide an implementation for both of these methods; they are no longer no-ops.
  - Both methods must return a promise.
- Update SubscribeBlockTracker to not pass empty `newHeads` parameter to `eth_subscribe` call ([#108](https://github.com/MetaMask/eth-block-tracker/pull/108))
  - This change was made because OpenEthereum does not support this parameter. While we've done our best to confirm that this will not be a breaking change for other Ethereum implementations, you will want to confirm no breakages for yours.

### Security
- Add `@lavamoat/allow-scripts` to ensure that install scripts are opt-in for dependencies ([#97](https://github.com/MetaMask/eth-block-tracker/pull/97))

## [5.0.1] - 2021-03-25
### Fixed
- Add missing `types` field to `package.json` ([#75](https://github.com/MetaMask/eth-block-tracker/pull/75))

## [5.0.0] - 2021-03-25
### Changed
- **(BREAKING)** Refactor exports ([#71](https://github.com/MetaMask/eth-block-tracker/pull/71))
- **(BREAKING)** Target ES2017, remove ES5 builds ([#71](https://github.com/MetaMask/eth-block-tracker/pull/71))
- Migrate to TypeScript ([#71](https://github.com/MetaMask/eth-block-tracker/pull/71))
- Update various dependencies ([#44](https://github.com/MetaMask/eth-block-tracker/pull/44), [#49](https://github.com/MetaMask/eth-block-tracker/pull/49), [#54](https://github.com/MetaMask/eth-block-tracker/pull/54), [#59](https://github.com/MetaMask/eth-block-tracker/pull/59), [#61](https://github.com/MetaMask/eth-block-tracker/pull/61), [#62](https://github.com/MetaMask/eth-block-tracker/pull/62), [#63](https://github.com/MetaMask/eth-block-tracker/pull/63), [#70](https://github.com/MetaMask/eth-block-tracker/pull/70), [#72](https://github.com/MetaMask/eth-block-tracker/pull/72))

### Removed
- Remove unused production dependencies ([#60](https://github.com/MetaMask/eth-block-tracker/pull/60), [#68](https://github.com/MetaMask/eth-block-tracker/pull/68))

## [4.4.3] - 2019-08-30
### Added
- Add SubscribeBlockTracker

### Changed
- Change events so that they now only return the block number (internal polling is done via `eth_blockNumber`)
- Add `retryTimeout` and `keepEventLoopActive` to constructor
- Update block trackers to inherit from `safe-event-emitter` rather than EventEmitter

### Removed
- Remove `block` event
  - Please use `latest` or `sync`.

## [4.0.0] - 2018-04-26
### Added
- Add isRunning method
- Add `error` event

### Changed
- Significantly rewrite `eth-block-tracker` (primarily due to optimizing network IO)
- Rename `awaitCurrentBlock` to `getLatestBlock`

### Removed
- Remove `stop`/`start` methods from BlockTrackers
  - BlockTrackers now automatically start and stop based on listener count for the `latest` and `sync` events. You can force a stop by calling the `EventEmitter` method `removeAllListeners`.
- Remove tx body from block
- Remove getTrackingBlock
- Remove start/stop
- Remove test/util/testBlockMiddleware

## [3.0.0] - 2018-04-16
### Changed
- Update published version so main module now exports unprocessed source
- Module includes dist:
  - Bundle: `dist/EthBlockTracker.js`
  - ES5 source: `dist/es5/`
- Rename `lib` to `src`
- Update RpcBlockTracker to be a normal `EventEmitter`
  - It no longer provides a callback to event handlers.

### Fixed
- Fix `awaitCurrentBlock` return value

## [2.0.0] - 2017-06-14
### Added
- Expose EventEmitter interface (via `async-eventemitter`)
- Add `getTrackingBlock`, `getCurrentBlock`, `start`, and `stop`
- Add events: `block`, `latest`, `sync`

## [1.0.0] - 2017-02-03
### Added
- Add RpcBlockTracker

[Unreleased]: https://github.com/MetaMask/eth-block-tracker/compare/v11.0.0...HEAD
[11.0.0]: https://github.com/MetaMask/eth-block-tracker/compare/v10.1.0...v11.0.0
[10.1.0]: https://github.com/MetaMask/eth-block-tracker/compare/v10.0.0...v10.1.0
[10.0.0]: https://github.com/MetaMask/eth-block-tracker/compare/v9.0.3...v10.0.0
[9.0.3]: https://github.com/MetaMask/eth-block-tracker/compare/v9.0.2...v9.0.3
[9.0.2]: https://github.com/MetaMask/eth-block-tracker/compare/v9.0.1...v9.0.2
[9.0.1]: https://github.com/MetaMask/eth-block-tracker/compare/v9.0.0...v9.0.1
[9.0.0]: https://github.com/MetaMask/eth-block-tracker/compare/v8.1.0...v9.0.0
[8.1.0]: https://github.com/MetaMask/eth-block-tracker/compare/v8.0.0...v8.1.0
[8.0.0]: https://github.com/MetaMask/eth-block-tracker/compare/v7.2.0...v8.0.0
[7.2.0]: https://github.com/MetaMask/eth-block-tracker/compare/v7.1.0...v7.2.0
[7.1.0]: https://github.com/MetaMask/eth-block-tracker/compare/v7.0.1...v7.1.0
[7.0.1]: https://github.com/MetaMask/eth-block-tracker/compare/v7.0.0...v7.0.1
[7.0.0]: https://github.com/MetaMask/eth-block-tracker/compare/v6.1.0...v7.0.0
[6.1.0]: https://github.com/MetaMask/eth-block-tracker/compare/v6.0.0...v6.1.0
[6.0.0]: https://github.com/MetaMask/eth-block-tracker/compare/v5.0.1...v6.0.0
[5.0.1]: https://github.com/MetaMask/eth-block-tracker/compare/v5.0.0...v5.0.1
[5.0.0]: https://github.com/MetaMask/eth-block-tracker/compare/v4.4.3...v5.0.0
[4.4.3]: https://github.com/MetaMask/eth-block-tracker/compare/v4.0.0...v4.4.3
[4.0.0]: https://github.com/MetaMask/eth-block-tracker/compare/v3.0.0...v4.0.0
[3.0.0]: https://github.com/MetaMask/eth-block-tracker/compare/v2.0.0...v3.0.0
[2.0.0]: https://github.com/MetaMask/eth-block-tracker/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/MetaMask/eth-block-tracker/releases/tag/v1.0.0
