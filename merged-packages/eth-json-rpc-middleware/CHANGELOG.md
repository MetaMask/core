# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [7.0.0] - 2021-03-25

### Added

- TypeScript types ([#68](https://github.com/MetaMask/eth-json-rpc-middleware/pull/68))

### Changed

- **(BREAKING)** Move middleware files to `/src` folder ([#60](https://github.com/MetaMask/eth-json-rpc-middleware/pull/60))
- **(BREAKING)** Convert all exports to named ([#81](https://github.com/MetaMask/eth-json-rpc-middleware/pull/81))
- Migrate to TypeScript ([#68](https://github.com/MetaMask/eth-json-rpc-middleware/pull/68))
- Replace `url` dependency with native URL global ([#67](https://github.com/MetaMask/eth-json-rpc-middleware/pull/67))
- Ask bundlers to ignore Node-specific depedencies in browser environments ([#78](https://github.com/MetaMask/eth-json-rpc-middleware/pull/78), [#84](https://github.com/MetaMask/eth-json-rpc-middleware/pull/84))
- Removed various unused production dependencies ([#10](https://github.com/MetaMask/eth-json-rpc-middleware/pull/10), [#80](https://github.com/MetaMask/eth-json-rpc-middleware/pull/80))

### Fixed

- `retryOnEmpty` middleware error messages ([#58](https://github.com/MetaMask/eth-json-rpc-middleware/pull/58))
  - They were referencing a different middleware.
- Default unrecognized methods to never be cached ([#66](https://github.com/MetaMask/eth-json-rpc-middleware/pull/66))
- Only publish necessary files ([#70](https://github.com/MetaMask/eth-json-rpc-middleware/pull/70))
- Robustify `providerFromEngine` callback parameter validation ([#76](https://github.com/MetaMask/eth-json-rpc-middleware/pull/76))
  - Previously, it only errored if the parameter was falsy. Now, it will error if it is not a function.
  - Passing the previous implementation a truthy, non-function value would cause fatal downstream errors.
- Prevent caching unrecognized requests ([#75](https://github.com/MetaMask/eth-json-rpc-middleware/pull/75))
  - Previously, nonsense values were sometimes cached, resulting in an ugly state and possibly a minor performance penalty.

### Removed

- **(BREAKING)** Parity middleware ([#63](https://github.com/MetaMask/eth-json-rpc-middleware/pull/63))
  - Previously imported as `eth-json-rpc-middleware/wallet-parity.js`

## [6.0.0] - 2020-09-22

### Changed

- **(BREAKING)** Delete VM middleware ([#56](https://github.com/MetaMask/eth-json-rpc-middleware/pull/56))
  - Previously imported as `eth-json-rpc-middleware/vm.js`

## [5.1.0] - 2020-09-22

### Changed

- `json-rpc-engine@5.3.0` ([#53](https://github.com/MetaMask/eth-json-rpc-middleware/pull/53))
- `eth-rpc-errors@3.0.0` ([#55](https://github.com/MetaMask/eth-json-rpc-middleware/pull/55))

[Unreleased]:https://github.com/MetaMask/eth-json-rpc-middleware/compare/v7.0.0...HEAD
[7.0.0]:https://github.com/MetaMask/eth-json-rpc-middleware/compare/v6.0.0...v7.0.0
[6.0.0]:https://github.com/MetaMask/eth-json-rpc-middleware/compare/v5.1.0...v6.0.0
[5.1.0]:https://github.com/MetaMask/eth-json-rpc-middleware/compare/v5.0.3...v5.1.0
