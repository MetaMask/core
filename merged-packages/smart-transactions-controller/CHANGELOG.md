# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.4.0]
### Added
- Add isomorphic-fetch to stx controller ([#38](https://github.com/MetaMask/smart-transactions-controller/pull/38))
- feat: create new handleFetch with custom error handling ([#35](https://github.com/MetaMask/smart-transactions-controller/pull/35))
- Unblock submit if ethers errors ([#30](https://github.com/MetaMask/smart-transactions-controller/pull/30))
- Parse chain ids from hex to dec instead of mapping them ([#31](https://github.com/MetaMask/smart-transactions-controller/pull/31))
- chore(deps): bump @metamask/controllers from 20.0.0 to 20.1.0 ([#28](https://github.com/MetaMask/smart-transactions-controller/pull/28))
- getTransactions -> getFees, refactoring ([#27](https://github.com/MetaMask/smart-transactions-controller/pull/27))
- chore(deps): bump @metamask/controllers from 19.0.0 to 20.0.0 ([#24](https://github.com/MetaMask/smart-transactions-controller/pull/24))
- Switch license with MetaMask license ([#25](https://github.com/MetaMask/smart-transactions-controller/pull/25))

## [1.3.0]
### Added
- Use the production version of the Transaction APIs repo ([#37](https://github.com/MetaMask/smart-transactions-controller/pull/37))

## [1.2.0]
### Added
- Add more unit tests for SmartTransactionsController ([#23](https://github.com/MetaMask/smart-transactions-controller/pull/23))
- chore(deps): bump @metamask/controllers from 16.0.0 to 19.0.0 ([#18](https://github.com/MetaMask/smart-transactions-controller/pull/18))
- Add cancelled status to stx after successful cancel request ([#21](https://github.com/MetaMask/smart-transactions-controller/pull/21))
- 1.1.0 ([#22](https://github.com/MetaMask/smart-transactions-controller/pull/22))

## [1.1.0]
### Added
- Tracking of STX status changes ([#20](https://github.com/MetaMask/smart-transactions-controller/pull/20))
- Remove cancelled transaction when new trx with same nonce submitted ([#19](https://github.com/MetaMask/smart-transactions-controller/pull/19))
- chore: modify polling and clean up tests ([#17](https://github.com/MetaMask/smart-transactions-controller/pull/17))
- State changes + getTransactions fn ([#16](https://github.com/MetaMask/smart-transactions-controller/pull/16))
- Add updatedTxParams and confirm history event ([#15](https://github.com/MetaMask/smart-transactions-controller/pull/15))
- Smart Transactions List ([#13](https://github.com/MetaMask/smart-transactions-controller/pull/13))

## [1.0.0]
### Added
- Adds nonce to a tx, adds `yarn build:link` support, updates functions for API calls, refactoring ([#8](https://github.com/MetaMask/smart-transactions-controller/pull/8))
- Add many unit tests, support for the batch_status API, refactoring ([#6](https://github.com/MetaMask/smart-transactions-controller/pull/6))
- Bump @metamask/controllers from 15.1.0 to 16.0.0
- Bump @metamask/controllers from 15.0.0 to 15.1.0 ([#4](https://github.com/MetaMask/smart-transactions-controller/pull/4))
- Add initial methods ([#3](https://github.com/MetaMask/smart-transactions-controller/pull/3))
- Add initial SmartTransactionsController ([#1](https://github.com/MetaMask/smart-transactions-controller/pull/1))
- Initial commit

[Unreleased]: https://github.com/MetaMask/smart-transactions-controller/compare/v1.4.0...HEAD
[1.4.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/MetaMask/smart-transactions-controller/releases/tag/v1.0.0
