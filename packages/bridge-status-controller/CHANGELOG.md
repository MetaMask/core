# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [13.0.0]

### Uncategorized

- Release/365.0.0 ([#5665](https://github.com/MetaMask/core/pull/5665))
- Release/362.0.0 ([#5657](https://github.com/MetaMask/core/pull/5657))
- feat: calculate bridge quote metadata in @metamask/bridge-controller ([#5614](https://github.com/MetaMask/core/pull/5614))
- Release 358.0.0 ([#5648](https://github.com/MetaMask/core/pull/5648))

### Added

- **BREAKING:** Add `@metamask/snaps-controllers` peer dependency at `^11.0.0` ([#5634](https://github.com/MetaMask/core/pull/5634), [#5639](https://github.com/MetaMask/core/pull/5639))
- **BREAKING:** Add `@metamask/gas-fee-controller` peer dependency at `^23.0.0` ([#5643](https://github.com/MetaMask/core/pull/5643))
- **BREAKING:** Add `@metamask/assets-controllers` peer dependency at `^57.0.0` ([#5643](https://github.com/MetaMask/core/pull/5643))
- Add `@metamask/user-operation-controller` dependency at `^33.0.0` ([#5643](https://github.com/MetaMask/core/pull/5643))
- Add `uuid` dependency at `^8.3.2` ([#5634](https://github.com/MetaMask/core/pull/5634))
- Add `@metamask/keyring-api` dependency at `^17.4.0` ([#5643](https://github.com/MetaMask/core/pull/5643))
- Add `bignumber.js` dependency at `^9.1.2` ([#5643](https://github.com/MetaMask/core/pull/5643))
- Add `submitTx` handler that submits cross-chain swaps transactions and triggers polling for destination transaction status ([#5634](https://github.com/MetaMask/core/pull/5634))
- Enable submitting EVM transactions using `submitTx` ([#5643](https://github.com/MetaMask/core/pull/5643))
- Add functionality for importing tokens from transaction after successful confirmation ([#5643](https://github.com/MetaMask/core/pull/5643))

### Changed

- **BREAKING** Change `@metamask/bridge-controller` from dependency to peer dependency and bump to `^15.0.0` ([#5643](https://github.com/MetaMask/core/pull/5643))
- Add optional config.customBridgeApiBaseUrl constructor arg to set the bridge-api base URL ([#5634](https://github.com/MetaMask/core/pull/5634))
- Add required `addTransactionFn` and `estimateGasFeeFn` args to the BridgeStatusController constructor to enable calling TransactionController's methods from `submitTx` ([#5643](https://github.com/MetaMask/core/pull/5643))
- Add optional `addUserOperationFromTransactionFn` arg to the BridgeStatusController constructor to enable submitting txs from smart accounts using the UserOperationController's addUserOperationFromTransaction method ([#5643](https://github.com/MetaMask/core/pull/5643))

### Fixed

- Update validators to accept any `bridge` string in the StatusResponse ([#5634](https://github.com/MetaMask/core/pull/5634))

## [12.0.1]

### Fixed

- Add `relay` to the list of bridges in the `BridgeId` enum to prevent validation from failing ([#5623](https://github.com/MetaMask/core/pull/5623))

## [12.0.0]

### Changed

- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^54.0.0` ([#5615](https://github.com/MetaMask/core/pull/5615))

## [11.0.0]

### Changed

- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^53.0.0` ([#5585](https://github.com/MetaMask/core/pull/5585))
- Bump `@metamask/bridge-controller` dependency to `^11.0.0` ([#5525](https://github.com/MetaMask/core/pull/5525))
- **BREAKING:** Change controller to fetch multichain address instead of EVM ([#5554](https://github.com/MetaMask/core/pull/5540))

## [10.0.0]

### Changed

- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^52.0.0` ([#5513](https://github.com/MetaMask/core/pull/5513))
- Bump `@metamask/bridge-controller` peer dependency to `^10.0.0` ([#5513](https://github.com/MetaMask/core/pull/5513))

## [9.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` to `^27.0.0` ([#5507](https://github.com/MetaMask/core/pull/5507))
- **BREAKING:** Bump peer dependency `@metamask/network-controller` to `^23.0.0` ([#5507](https://github.com/MetaMask/core/pull/5507))
- **BREAKING:** Bump peer dependency `@metamask/transaction-controller` to `^51.0.0` ([#5507](https://github.com/MetaMask/core/pull/5507))
- Bump `@metamask/bridge-controller` to `^9.0.0` ([#5507](https://github.com/MetaMask/core/pull/5507))
- Bump `@metamask/polling-controller` to `^13.0.0` ([#5507](https://github.com/MetaMask/core/pull/5507))

## [8.0.0]

### Changed

- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^50.0.0` ([#5496](https://github.com/MetaMask/core/pull/5496))

## [7.0.0]

### Changed

- Bump `@metamask/accounts-controller` dev dependency to `^26.1.0` ([#5481](https://github.com/MetaMask/core/pull/5481))
- **BREAKING:** Allow changing the Bridge API url through the `config` param in the constructor. Remove previous method of doing it through `process.env`. ([#5465](https://github.com/MetaMask/core/pull/5465))

### Fixed

- `@metamask/bridge-controller` dependency is no longer a peer dependency, just a direct dependency ([#5464](https://github.com/MetaMask/core/pull/5464))

## [6.0.0]

### Changed

- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^49.0.0` ([#5471](https://github.com/MetaMask/core/pull/5471))

## [5.0.0]

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency to `^26.0.0` ([#5439](https://github.com/MetaMask/core/pull/5439))
- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^48.0.0` ([#5439](https://github.com/MetaMask/core/pull/5439))
- **BREAKING:** Bump `@metamask/bridge-controller` peer dependency to `^5.0.0` ([#5439](https://github.com/MetaMask/core/pull/5439))

## [4.0.0]

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency to `^25.0.0` ([#5426](https://github.com/MetaMask/core/pull/5426))
- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^47.0.0` ([#5426](https://github.com/MetaMask/core/pull/5426))
- **BREAKING:** Bump `@metamask/bridge-controller` peer dependency to `^4.0.0` ([#5426](https://github.com/MetaMask/core/pull/5426))

## [3.0.0]

### Changed

- **BREAKING:** Bump `@metamask/bridge-controller` to v3.0.0
- Improve `BridgeStatusController` API response validation readability by using `@metamask/superstruct` ([#5408](https://github.com/MetaMask/core/pull/5408))

## [2.0.0]

### Changed

- **BREAKING:** Change `BridgeStatusController` state structure to have all fields at root of state ([#5406](https://github.com/MetaMask/core/pull/5406))
- **BREAKING:** Redundant type `BridgeStatusState` removed from exports ([#5406](https://github.com/MetaMask/core/pull/5406))

## [1.0.0]

### Added

- Initial release ([#5317](https://github.com/MetaMask/core/pull/5317))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@13.0.0...HEAD
[13.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@12.0.1...@metamask/bridge-status-controller@13.0.0
[12.0.1]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@12.0.0...@metamask/bridge-status-controller@12.0.1
[12.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@11.0.0...@metamask/bridge-status-controller@12.0.0
[11.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@10.0.0...@metamask/bridge-status-controller@11.0.0
[10.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@9.0.0...@metamask/bridge-status-controller@10.0.0
[9.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@8.0.0...@metamask/bridge-status-controller@9.0.0
[8.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@7.0.0...@metamask/bridge-status-controller@8.0.0
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@6.0.0...@metamask/bridge-status-controller@7.0.0
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@5.0.0...@metamask/bridge-status-controller@6.0.0
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@4.0.0...@metamask/bridge-status-controller@5.0.0
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@3.0.0...@metamask/bridge-status-controller@4.0.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@2.0.0...@metamask/bridge-status-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@1.0.0...@metamask/bridge-status-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/bridge-status-controller@1.0.0
