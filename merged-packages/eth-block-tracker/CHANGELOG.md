# Changelog

All notable changes to this project will be documented in this file, as of version `5.0.0`.
Of prior releases, only versions `3.0.0` and `4.0.0` were documented at all.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [5.0.0] - 2021-03-25

### Changed

- **(BREAKING)** Refactor exports ([#71](https://github.com/MetaMask/eth-block-tracker/pull/71))
- **(BREAKING)** Target ES2017, remove ES5 builds ([#71](https://github.com/MetaMask/eth-block-tracker/pull/71))
- Migrate to TypeScript ([#71](https://github.com/MetaMask/eth-block-tracker/pull/71))
- Update various dependencies ([#44](https://github.com/MetaMask/eth-block-tracker/pull/44), [#49](https://github.com/MetaMask/eth-block-tracker/pull/49), [#54](https://github.com/MetaMask/eth-block-tracker/pull/54), [#59](https://github.com/MetaMask/eth-block-tracker/pull/59), [#61](https://github.com/MetaMask/eth-block-tracker/pull/61), [#62](https://github.com/MetaMask/eth-block-tracker/pull/62), [#63](https://github.com/MetaMask/eth-block-tracker/pull/63), [#70](https://github.com/MetaMask/eth-block-tracker/pull/70), [#72](https://github.com/MetaMask/eth-block-tracker/pull/72))

### Removed

- Unused production dependencies ([#60](https://github.com/MetaMask/eth-block-tracker/pull/60), [#68](https://github.com/MetaMask/eth-block-tracker/pull/68))

## [4.4.3] - 2019-08-30

This release is included in the changelog to help illustrate the differences between
major versions `4` and `5`.

## [4.0.0] - 2018-04-26

Significant rewrite of `eth-block-tracker`. Primary reason was optimizing network IO.

BlockTrackers no longer have manual stop/start methods, they now automatically start and stop based on listener count for the `latest` and `sync` events. You can force a stop by calling the `EventEmitter` method `removeAllListeners`.

Events now only return the block number. Internal polling is done via `eth_blockNumber`.
The `block` event has been removed, please use `latest` or `sync`.

### Changed

- Added isRunning method
- Added `error` event
- Renamed awaitCurrentBlock -> getLatestBlock
- Removed tx body from block
- Removed getTrackingBlock
- Removed start/stop
- Removed `block` event
- Removed test/util/testBlockMiddleware

## [3.0.0] - 2018-04-16

### Changed

- npm module main now exports unprocessed source
- Module includes dist:
  - Bundle: `dist/EthBlockTracker.js`
  - ES5 source: `dist/es5/`
- Fixes `awaitCurrentBlock` return value
- `lib` renamed to `src`
- `eth-block-tracker` is now a normal `EventEmitter`, does not provide a callback to event handlers

## [2.0.0] - 2017-06-14

## [1.0.0] - 2017-02-03

[Unreleased]:https://github.com/MetaMask/eth-block-tracker/compare/v5.0.0...HEAD
[5.0.0]:https://github.com/MetaMask/eth-block-tracker/compare/v4.4.3...v5.0.0
[4.4.3]:https://github.com/MetaMask/eth-block-tracker/compare/v4.0.0...v4.4.3
[4.0.0]:https://github.com/MetaMask/eth-block-tracker/compare/v3.0.0...v4.0.0
[3.0.0]:https://github.com/MetaMask/eth-block-tracker/compare/v2.0.0...v3.0.0
[2.0.0]:https://github.com/MetaMask/eth-block-tracker/compare/v1.0.0...v2.0.0
[1.0.0]:https://github.com/MetaMask/eth-block-tracker/releases/tag/v1.0.0
