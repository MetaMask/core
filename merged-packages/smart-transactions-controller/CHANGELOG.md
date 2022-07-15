# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.3.0]
### Added
- Add the "clearFees" function ([#84](https://github.com/MetaMask/smart-transactions-controller/pull/84))

## [2.2.0]
### Changed
- chore(deps): bump @metamask/controllers from 30.0.0 to 30.1.0 ([#81](https://github.com/MetaMask/smart-transactions-controller/pull/81))
- chore(deps-dev): bump @metamask/eslint-config-nodejs from 8.0.0 to 9.0.0 ([#80](https://github.com/MetaMask/smart-transactions-controller/pull/80))
- chore(deps-dev): bump @metamask/auto-changelog from 2.6.0 to 2.6.1 ([#79](https://github.com/MetaMask/smart-transactions-controller/pull/79))
- Return all error props in an error response ([#82](https://github.com/MetaMask/smart-transactions-controller/pull/82))

## [2.1.0]
### Added
- chore(deps): bump @metamask/controllers from 29.0.1 to 30.0.0 ([#75](https://github.com/MetaMask/smart-transactions-controller/pull/75))
- chore(deps-dev): bump @metamask/auto-changelog from 2.5.0 to 2.6.0 ([#71](https://github.com/MetaMask/smart-transactions-controller/pull/71))
- Return a pending status for a cancelled tx that hasn't been settled yet ([#74](https://github.com/MetaMask/smart-transactions-controller/pull/74))

## [2.0.1]
### Changed
- Previous version deprecated due to missing build files. No code changes made.

## [2.0.0] [DEPRECATED]
### Added
- "estimateGas" -> "getFees", support a new cancellation reason, refactoring ([#69](https://github.com/MetaMask/smart-transactions-controller/pull/69))
- chore(deps): bump @metamask/controllers from 28.0.0 to 29.0.1 ([#68](https://github.com/MetaMask/smart-transactions-controller/pull/68))
- If mined status is not mined and cancel reason not set, then show the cancel link, refactoring ([#66](https://github.com/MetaMask/smart-transactions-controller/pull/66))
- chore(deps): bump @metamask/controllers from 27.1.1 to 28.0.0 ([#65](https://github.com/MetaMask/smart-transactions-controller/pull/65))

## [1.10.0]
### Added
- Handle the "cancelled" status, lower status polling interval from 10s to 5s, don't mark a tx as cancelled immediately, track uuid ([#63](https://github.com/MetaMask/smart-transactions-controller/pull/63))
- chore(deps): bump @metamask/controllers from 25.1.0 to 27.1.1 ([#62](https://github.com/MetaMask/smart-transactions-controller/pull/62))
- Add tracking of the "current_stx_enabled" param ([#58](https://github.com/MetaMask/smart-transactions-controller/pull/58))

## [1.9.1]
### Added
- Use the "confirmExternalTransaction" fn directly ([#56](https://github.com/MetaMask/smart-transactions-controller/pull/56))

## [1.9.0]
### Added
- Only accept the "getNonceLock" fn and not the whole "nonceTracker" ([#54](https://github.com/MetaMask/smart-transactions-controller/pull/54))

## [1.8.0]
### Added
- Do not update an STX which doesn't exist anymore, add UTs ([#52](https://github.com/MetaMask/smart-transactions-controller/pull/52))

## [1.7.0]
### Added
- Fix UTs, change threshold ([#49](https://github.com/MetaMask/smart-transactions-controller/pull/49))

## [1.6.0]
### Added
- Change cancellable interval to be 1 minute ([#47](https://github.com/MetaMask/smart-transactions-controller/pull/47))
- Estimate approval transaction along with swaps transaction ([#46](https://github.com/MetaMask/smart-transactions-controller/pull/46))
- chore(deps): bump @metamask/controllers from 20.1.0 to 25.1.0 ([#44](https://github.com/MetaMask/smart-transactions-controller/pull/44))
- Add support for approveTxParams ([#45](https://github.com/MetaMask/smart-transactions-controller/pull/45))
- Add method for estimateGas ([#43](https://github.com/MetaMask/smart-transactions-controller/pull/43))

## [1.5.0]
### Added
- Add "fees" and "liveness" into the smartTransactionsState, update version ([#41](https://github.com/MetaMask/smart-transactions-controller/pull/41))

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

[Unreleased]: https://github.com/MetaMask/smart-transactions-controller/compare/v2.3.0...HEAD
[2.3.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v2.2.0...v2.3.0
[2.2.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v2.0.1...v2.1.0
[2.0.1]: https://github.com/MetaMask/smart-transactions-controller/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v1.10.0...v2.0.0
[1.10.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v1.9.1...v1.10.0
[1.9.1]: https://github.com/MetaMask/smart-transactions-controller/compare/v1.9.0...v1.9.1
[1.9.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v1.8.0...v1.9.0
[1.8.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/MetaMask/smart-transactions-controller/releases/tag/v1.0.0
