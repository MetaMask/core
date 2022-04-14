# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/MetaMask/eth-block-tracker/compare/v5.0.1...HEAD
[5.0.1]: https://github.com/MetaMask/eth-block-tracker/compare/v5.0.0...v5.0.1
[5.0.0]: https://github.com/MetaMask/eth-block-tracker/compare/v4.4.3...v5.0.0
[4.4.3]: https://github.com/MetaMask/eth-block-tracker/compare/v4.0.0...v4.4.3
[4.0.0]: https://github.com/MetaMask/eth-block-tracker/compare/v3.0.0...v4.0.0
[3.0.0]: https://github.com/MetaMask/eth-block-tracker/compare/v2.0.0...v3.0.0
[2.0.0]: https://github.com/MetaMask/eth-block-tracker/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/MetaMask/eth-block-tracker/releases/tag/v1.0.0
