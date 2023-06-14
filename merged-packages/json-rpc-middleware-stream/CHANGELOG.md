# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [4.2.2]
### Changed
- Bump @metamask/safe-event-emitter from 2.0.0 to 3.0.0 ([#44](https://github.com/MetaMask/json-rpc-middleware-stream/pull/44))

### Fixed
- Fix race condition in `createStreamMiddleware` ([#47](https://github.com/MetaMask/json-rpc-middleware-stream/pull/47))
  - Previously this middleware would fail to process synchronous responses on initialized streams

## [4.2.1]
### Fixed
- Add early return in createStreamMiddleware.processsResponse method if JSON RPC request is not found ([#35](https://github.com/MetaMask/json-rpc-middleware-stream/pull/35))

## [4.2.0]
### Changed
- Change error throw when response is seen for unknown request into warning displayed in console ([#32](https://github.com/MetaMask/json-rpc-middleware-stream/pull/32))

## [4.1.0]
### Changed
- Added retry limit of 3 to requests ([#30](https://github.com/MetaMask/json-rpc-middleware-stream/pull/30))

## [4.0.0] - 2022-10-03
### Changed
- BREAKING: Add Node 12 as minimum required version [#15](https://github.com/MetaMask/json-rpc-middleware-stream/pull/15)
- Retry pending requests when notification to reconnect is received ([#27](https://github.com/MetaMask/json-rpc-middleware-stream/pull/27))

### Security
- Add `@lavamoat/allow-scripts` to make dependency install scripts opt-in ([#25](https://github.com/MetaMask/json-rpc-middleware-stream/pull/25))

## [3.0.0] - 2020-12-08
### Added
- TypeScript typings ([#11](https://github.com/MetaMask/json-rpc-middleware-stream/pull/11))

[Unreleased]: https://github.com/MetaMask/json-rpc-middleware-stream/compare/v4.2.2...HEAD
[4.2.2]: https://github.com/MetaMask/json-rpc-middleware-stream/compare/v4.2.1...v4.2.2
[4.2.1]: https://github.com/MetaMask/json-rpc-middleware-stream/compare/v4.2.0...v4.2.1
[4.2.0]: https://github.com/MetaMask/json-rpc-middleware-stream/compare/v4.1.0...v4.2.0
[4.1.0]: https://github.com/MetaMask/json-rpc-middleware-stream/compare/v4.0.0...v4.1.0
[4.0.0]: https://github.com/MetaMask/json-rpc-middleware-stream/compare/v3.0.0...v4.0.0
[3.0.0]: https://github.com/MetaMask/json-rpc-middleware-stream/releases/tag/v3.0.0
