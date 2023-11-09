# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [6.2.2]
### Fixed
- Revert "Parameterize SmartTransactionsController state by ChainId for MultiChain + Integrate PollingController Mixin ([#235](https://github.com/MetaMask/smart-transactions-controller/pull/235))

## [6.2.1] [DEPRECATED]
### Fixed
- Fix a typo in a URL for submitting transactions ([#230](https://github.com/MetaMask/smart-transactions-controller/pull/230))

## [6.2.0] [DEPRECATED]
### Added
- Pass current version of this package to API when submitting transactions ([#227](https://github.com/MetaMask/smart-transactions-controller/pull/227))

## [6.1.0] [DEPRECATED]
### Added
- Add a new "userOptInV2" prop ([#222](https://github.com/MetaMask/smart-transactions-controller/pull/222))

### Changed
- Bump @metamask/network-controller from 15.0.0 to 15.1.0 ([#219](https://github.com/MetaMask/smart-transactions-controller/pull/219))

## [6.0.0] [DEPRECATED]
### Added
- **BREAKING:** `getNetworkClientById` is now required argument in constructor options object ([#210](https://github.com/MetaMask/smart-transactions-controller/pull/210))
- Integrate `PollingController` mixin and `_executePoll` method used for concurrent multichain polling ([#210](https://github.com/MetaMask/smart-transactions-controller/pull/210))
 - Consumers can now call `startPollingByNetworkClientId` with a networkClientId to start polling for a specific chain and `stopPollingByPollingToken` with the returned pollingToken to stop polling for that chain.

### Changed
- **BREAKING**: Bump `@metamask/network-controller` from ^13.0.1 to ^15.0.0 ([#211](https://github.com/MetaMask/smart-transactions-controller/pull/211))
- **BREAKING**: Replace `@ethersproject/providers` with `@metamask/eth-query` ([#210](https://github.com/MetaMask/smart-transactions-controller/pull/210))
- Remove `@ethersproject/bignumber` ([#210](https://github.com/MetaMask/smart-transactions-controller/pull/210))
- Add optional options object containing a `networkClientId` argument to the `updateSmartTransaction` method ([#210](https://github.com/MetaMask/smart-transactions-controller/pull/210))

## [5.0.0]
### Changed
- Bump dependency on `@metamask/network-controller` to ^13.0.0 ([#191](https://github.com/MetaMask/smart-transactions-controller/pull/191))
- Bump dependency on `@metamask/base-controller` to ^3.2.1 ([#191](https://github.com/MetaMask/smart-transactions-controller/pull/191))
- Bump dependency on `@metamask/controller-utils` to ^5.0.0 ([#191](https://github.com/MetaMask/smart-transactions-controller/pull/191))

### Removed
- **BREAKING:** Remove  `metamaskNetworkId` from smart transaction state ([#191](https://github.com/MetaMask/smart-transactions-controller/pull/191))
  - To migrate, remove references to `TransactionMeta.metamaskNetworkId` and `TransactionMeta.history.metamaskNetworkId`
- Remove `getNetwork` from constructor options ([#191](https://github.com/MetaMask/smart-transactions-controller/pull/191))

## [4.0.0]
### Changed
- **BREAKING**: Bump minimum Node.js version to v16 ([#161](https://github.com/MetaMask/smart-transactions-controller/pull/161))
- **BREAKING:** Remove `isomorphic-fetch` ([#131](https://github.com/MetaMask/smart-transactions-controller/pull/131))
  - Projects lacking `fetch` will now have to supply their own polyfill.
- Update `metamask/*` dependencies ([#131](https://github.com/MetaMask/smart-transactions-controller/pull/131)), ([#172](https://github.com/MetaMask/smart-transactions-controller/pull/172))
- Move `@types/lodash` to devDependencies ([#141](https://github.com/MetaMask/smart-transactions-controller/pull/141))

## [3.1.0]
### Changed
- Replace use of full `@metamask/controllers` repo with packages from `@metamask/core-monorepo` ([#110](https://github.com/MetaMask/smart-transactions-controller/pull/110), [#112](https://github.com/MetaMask/smart-transactions-controller/pull/112), [#113](https://github.com/MetaMask/smart-transactions-controller/pull/113))

## [3.0.0]
### Changed
- **BREAKING:** Bump required Node version to v14 ([#90](https://github.com/MetaMask/smart-transactions-controller/pull/90))
- `@metamask/controllers@32.0.2` ([#104](https://github.com/MetaMask/smart-transactions-controller/pull/104))

### Fixed
- Ensure the nonce lock is always released ([#108](https://github.com/MetaMask/smart-transactions-controller/pull/108))

## [2.3.2]
### Changed
- Replace `ethers` with submodules (@ethersproject/bignumber,@ethersproject/bytes, @ethersproject/providers,) - no functional change ([#95](https://github.com/MetaMask/smart-transactions-controller/pull/95))

## [2.3.1]
### Changed
- Remove unnecessary event props ([#93](https://github.com/MetaMask/smart-transactions-controller/pull/93))
- Update `is-release` filter ([#91](https://github.com/MetaMask/smart-transactions-controller/pull/91))
- update is-release filter ([#89](https://github.com/MetaMask/smart-transactions-controller/pull/89))
- use `MetaMask/action-is-release@v1.0` ([#88](https://github.com/MetaMask/smart-transactions-controller/pull/88))
- add config for MetaMask/action-npm-publish ([#85](https://github.com/MetaMask/smart-transactions-controller/pull/85))

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

[Unreleased]: https://github.com/MetaMask/smart-transactions-controller/compare/v6.2.2...HEAD
[6.2.2]: https://github.com/MetaMask/smart-transactions-controller/compare/v6.2.1...v6.2.2
[6.2.1]: https://github.com/MetaMask/smart-transactions-controller/compare/v6.2.0...v6.2.1
[6.2.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v6.1.0...v6.2.0
[6.1.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v6.0.0...v6.1.0
[6.0.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v5.0.0...v6.0.0
[5.0.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v4.0.0...v5.0.0
[4.0.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v3.1.0...v4.0.0
[3.1.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v3.0.0...v3.1.0
[3.0.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v2.3.2...v3.0.0
[2.3.2]: https://github.com/MetaMask/smart-transactions-controller/compare/v2.3.1...v2.3.2
[2.3.1]: https://github.com/MetaMask/smart-transactions-controller/compare/v2.3.0...v2.3.1
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
