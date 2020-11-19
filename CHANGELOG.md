# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [5.0.0] - 2020-11-19

### Added

- `ApprovalController` ([#309](https://github.com/MetaMask/controllers/pull/309))
  - Add user-defined default type
  - Add `Date.now()` timestamps to request (`approval.time`)
  - Enable `has` lookups by `type` only

### Changed

- **Breaking:** `ApprovalController`: Require types for all requests ([#309](https://github.com/MetaMask/controllers/pull/309))
- `ApprovalController`: Rename `ApprovalInfo` interface to `Approval` ([#309](https://github.com/MetaMask/controllers/pull/309))
- `PhishingController`: Make `no-cache` fetch option explicit ([#297](https://github.com/MetaMask/controllers/pull/297))
- Make package compatible with Node 12 ([#287](https://github.com/MetaMask/controllers/pull/287))

### Fixed

- `ApprovalController`: Fix faulty `origin` parameter type check ([#309](https://github.com/MetaMask/controllers/pull/309))
  - The type check was too loose, and would've permitted some invalid origins.

## [4.2.0] - 2020-11-13

### Added

- Expose `ApprovalController` count state ([#306](https://github.com/MetaMask/controllers/pull/306))
- `KeyringController` `onLock`/`onUnlock` event handlers ([#307](https://github.com/MetaMask/controllers/pull/307))

### Fixed

- Properly initialize `ApprovalController` ([#306](https://github.com/MetaMask/controllers/pull/306))

## [4.1.0] - 2020-11-10

### Added

- `ApprovalController` approval count methods ([#304](https://github.com/MetaMask/controllers/pull/304))

## [4.0.2] - 2020-11-09

### Changed

- Unpin `eth-sig-util` dependency ([#302](https://github.com/MetaMask/controllers/pull/302))

## [4.0.1] - 2020-11-09

### Fixed

- Fix `ApprovalController` export ([#300](https://github.com/MetaMask/controllers/pull/300))

## [4.0.0] - 2020-11-09

### Added

- Add `ApprovalController` ([#289](https://github.com/MetaMask/controllers/pull/289))

### Changed

- Allow configuring `CurrencyController` to always fetch USD rate ([#292](https://github.com/MetaMask/controllers/pull/292))

### Removed

- **BREAKING:** Remove `NetworkStatusController` ([#298](https://github.com/MetaMask/controllers/pull/298))

## [3.2.0] - 2020-10-21

### Added

- Add `addNewAccountWithoutUpdate` method ([#288](https://github.com/MetaMask/controllers/pull/288))

## [3.1.0] - 2020-09-23

### Changed

- Update various dependencies
  - eth-rpc-errors@3.0.0 ([#284](https://github.com/MetaMask/controllers/pull/284))
  - web3-provider-engine@16.0.1 ([#283](https://github.com/MetaMask/controllers/pull/283))
  - isomorphic-fetch@3.0.0 ([#282](https://github.com/MetaMask/controllers/pull/282))
  - eth-json-rpc-infura@5.1.0 ([#281](https://github.com/MetaMask/controllers/pull/281))

## [3.0.1] - 2020-09-15

### Changed

- Remove `If-None-Match` header from phishing config requests ([#277](https://github.com/MetaMask/controllers/pull/277))

## [3.0.0] - 2020-09-11

### Changed

- Use Infura v3 API ([#267](https://github.com/MetaMask/controllers/pull/267))

## [2.0.5] - 2020-08-18

### Changed

- Add prepublishOnly build script (#260)

## [2.0.4] - 2020-08-18

### Changed

- Use jsDelivr instead of the GitHub API for content (#256)
- Lower phishing config poll rate to 1 req/hr (#257)
- Use renamed `eth-rpc-error` package (#252)

## [2.0.3] - 2020-07-27

### Added

- TransactionsController: Bugfix cancel / speedup transactions (#248)

## [2.0.2] - 2020-07-14

### Added

- TransactionsController: Fetch incoming token transactions (#247)

## [2.0.1] - 2020-06-18

### Changed

- Update `PhishingController` endpoint to use GitHub API (#244)

## [2.0.0] - 2020-05-07

### Changed

- Rebrand as `@metamask/controllers` (#226)
- Use yarn & drop `npm-shrinkwrap.json` (#193)

## Removed

- Remove shapeshift controller (#209)

[Unreleased]:https://github.com/MetaMask/controllers/compare/v5.0.0...HEAD
[5.0.0]:https://github.com/MetaMask/controllers/compare/v4.2.0...v5.0.0
[4.2.0]:https://github.com/MetaMask/controllers/compare/v4.1.0...v4.2.0
[4.1.0]:https://github.com/MetaMask/controllers/compare/v4.0.2...v4.1.0
[4.0.2]:https://github.com/MetaMask/controllers/compare/v4.0.1...v4.0.2
[4.0.1]:https://github.com/MetaMask/controllers/compare/v4.0.0...v4.0.1
[4.0.0]:https://github.com/MetaMask/controllers/compare/v3.2.0...v4.0.0
[3.2.0]:https://github.com/MetaMask/controllers/compare/v3.1.0...v3.2.0
[3.1.0]:https://github.com/MetaMask/controllers/compare/v3.0.1...v3.1.0
[3.0.1]:https://github.com/MetaMask/controllers/compare/v3.0.0...v3.0.1
[3.0.0]:https://github.com/MetaMask/controllers/compare/v2.0.5...v3.0.0
[2.0.5]:https://github.com/MetaMask/controllers/compare/v2.0.4...v2.0.5
[2.0.4]:https://github.com/MetaMask/controllers/compare/v2.0.3...v2.0.4
[2.0.3]:https://github.com/MetaMask/controllers/compare/v2.0.2...v2.0.3
[2.0.2]:https://github.com/MetaMask/controllers/compare/v2.0.1...v2.0.2
[2.0.1]:https://github.com/MetaMask/controllers/compare/v2.0.0...v2.0.1
[2.0.0]:https://github.com/MetaMask/controllers/tree/v2.0.0
