# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

## Added

- TransactionsController: Bugfix cancel / speedup transactions (#248)


## [2.0.2] - 2020-07-14

## Added

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

[Unreleased]:https://github.com/MetaMask/controllers/compare/v3.0.1...HEAD
[3.1.0]:https://github.com/MetaMask/controllers/compare/v3.0.1...v3.1.0
[3.0.1]:https://github.com/MetaMask/controllers/compare/v3.0.0...v3.0.1
[3.0.0]:https://github.com/MetaMask/controllers/compare/v2.0.5...v3.0.0
[2.0.5]:https://github.com/MetaMask/controllers/compare/v2.0.4...v2.0.5
[2.0.4]:https://github.com/MetaMask/controllers/compare/v2.0.3...v2.0.4
[2.0.3]:https://github.com/MetaMask/controllers/compare/v2.0.2...v2.0.3
[2.0.2]:https://github.com/MetaMask/controllers/compare/v2.0.1...v2.0.2
[2.0.1]:https://github.com/MetaMask/controllers/compare/v2.0.0...v2.0.1
[2.0.0]:https://github.com/MetaMask/controllers/tree/v2.0.0
