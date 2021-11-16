# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/MetaMask/smart-transactions-controller/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/MetaMask/smart-transactions-controller/releases/tag/v1.0.0
