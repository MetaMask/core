# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Move peer dependencies for controller and service packages to direct dependencies ([#7209](https://github.com/MetaMask/core/pull/7209))
  - The dependencies moved are:
    - `@metamask/assets-controllers` (^91.0.0)
    - `@metamask/bridge-controller` (^63.0.0)
    - `@metamask/bridge-status-controller` (^63.0.0)
    - `@metamask/gas-fee-controller` (^26.0.0)
    - `@metamask/network-controller` (^26.0.0)
    - `@metamask/remote-feature-flag-controller` (^2.0.1)
    - `@metamask/transaction-controller` (^62.1.0)
  - In clients, it is now possible for multiple versions of these packages to exist in the dependency tree.
    - For example, this scenario would be valid: a client relies on `@metamask/controller-a` 1.0.0 and `@metamask/controller-b` 1.0.0, and `@metamask/controller-b` depends on `@metamask/controller-a` 1.1.0.
  - Note, however, that the versions specified in the client's `package.json` always "win", and you are expected to keep them up to date so as not to break controller and service intercommunication.

## [10.0.0]

### Added

- Use gas fee token for Relay deposit transactions if insufficient native balance ([#7193](https://github.com/MetaMask/core/pull/7193))
  - Add optional `fees.isSourceGasFeeToken` property to `TransactionPayQuote` and `TransactionPayTotals` type.

### Changed

- **BREAKING:** Bump `@metamask/bridge-status-controller` from `^62.0.0` to `^63.0.0` ([#7207](https://github.com/MetaMask/core/pull/7207))
- **BREAKING:** Bump `@metamask/bridge-controller` from `^62.0.0` to `^63.0.0` ([#7207](https://github.com/MetaMask/core/pull/7207))
- **BREAKING:** Bump `@metamask/assets-controllers` from `^90.0.0` to `^91.0.0` ([#7207](https://github.com/MetaMask/core/pull/7207))

## [9.0.0]

### Changed

- Bump `@metamask/controller-utils` from `^11.15.0` to `^11.16.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- **BREAKING:** Bump `@metamask/transaction-controller` from `^61.0.0` to `^62.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- **BREAKING:** Bump `@metamask/network-controller` from `^25.0.0` to `^26.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- **BREAKING:** Bump `@metamask/gas-fee-controller` from `^25.0.0` to `^26.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- **BREAKING:** Bump `@metamask/bridge-status-controller` from `^61.0.0` to `^62.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- **BREAKING:** Bump `@metamask/bridge-controller` from `^61.0.0` to `^62.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- **BREAKING:** Bump `@metamask/assets-controllers` from `^89.0.0` to `^90.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))

### Fixed

- Ensure source network fee for Relay quotes includes all items and steps ([#7191](https://github.com/MetaMask/core/pull/7191))

## [8.0.0]

### Changed

- **BREAKING:** Bump `@metamask/assets-controller` from `^88.0.0` to `^89.0.0` ([#7179](https://github.com/MetaMask/core/pull/7179))
- **BREAKING:** Bump `@metamask/bridge-controller` from `^60.0.0` to `^61.0.0` ([#7179](https://github.com/MetaMask/core/pull/7179))
- **BREAKING:** Bump `@metamask/bridge-status-controller` from `^60.0.0` to `^61.0.0` ([#7179](https://github.com/MetaMask/core/pull/7179))

## [7.0.0]

### Added

- **BREAKING:** Add `sourceAmount` to `TransactionPayQuote` ([#7159](https://github.com/MetaMask/core/pull/7159))
  - Add `estimate` and `max` properties to `fee.sourceNetwork` in `TransactionPayQuote`.
  - Add `isTargetGasFeeToken` to `fee` in `TransactionPayQuote`.
  - Add matching properties to `TransactionPayTotals`.
  - Use fixed fiat rate for Polygon USDCe and Arbitrum USDC.

## [6.0.0]

### Fixed

- **BREAKING:** Always retrieve quote if using Relay strategy and required token is Arbitrum USDC, even if payment token matches ([#7146](https://github.com/MetaMask/core/pull/7146))
  - Change `getStrategy` constructor option from asynchronous to synchronous.

## [5.0.0]

### Added

- **BREAKING:** Include transactions in Relay quotes via EIP-7702 and delegation ([#7122](https://github.com/MetaMask/core/pull/7122))
  - Requires new `getDelegationTransaction` constructor option.

### Changed

- Updated `getBridgeBatchTransactions` types to account for multichain approvals ([#6862](https://github.com/MetaMask/core/pull/6862))

### Fixed

- Read Relay provider fees directly from response ([#7098](https://github.com/MetaMask/core/pull/7098))

## [4.0.0]

### Added

- Support Relay quotes with multiple transactions ([#7089](https://github.com/MetaMask/core/pull/7089))

### Changed

- **BREAKING:** Bump `@metamask/assets-controller` from `^87.0.0` to `^88.0.0` ([#7100](https://github.com/MetaMask/core/pull/7100))
- **BREAKING:** Bump `@metamask/bridge-controller` from `^59.0.0` to `^60.0.0` ([#7100](https://github.com/MetaMask/core/pull/7100))
- **BREAKING:** Bump `@metamask/bridge-status-controller` from `^59.0.0` to `^60.0.0` ([#7100](https://github.com/MetaMask/core/pull/7100))

## [3.1.0]

### Added

- Calculate totals even if no quotes received ([#7042](https://github.com/MetaMask/core/pull/7042))

### Fixed

- Fix bridging to native Polygon ([#7053](https://github.com/MetaMask/core/pull/7053))
  - Use original quote if bridge quote fails to refresh during submit.
  - Only refresh quotes if transaction status is unapproved.

## [3.0.0]

### Changed

- **BREAKING:** Bump `@metamask/assets-controller` from `^86.0.0` to `^87.0.0` ([#7043](https://github.com/MetaMask/core/pull/7043))
- **BREAKING:** Bump `@metamask/bridge-controller` from `^58.0.0` to `^59.0.0` ([#7043](https://github.com/MetaMask/core/pull/7043))
- **BREAKING:** Bump `@metamask/bridge-status-controller` from `^58.0.0` to `^59.0.0` ([#7043](https://github.com/MetaMask/core/pull/7043))

## [2.0.2]

### Fixed

- Prevent infinite loading after quotes are refreshed ([#7020](https://github.com/MetaMask/core/pull/7020))

## [2.0.1]

### Fixed

- Fix use of native Polygon as payment token in Bridge strategy ([#7008](https://github.com/MetaMask/core/pull/7008))
  - Ignore required tokens with no quotes when calculating totals.
  - Use correct feature flag key.
  - Ensure `isLoading` state is cleared if quotes not updated.

## [2.0.0]

### Changed

- **BREAKING:** Bump `@metamask/assets-controller` from `^85.0.0` to `^86.0.0` ([#7011](https://github.com/MetaMask/core/pull/7011))
- **BREAKING:** Bump `@metamask/bridge-controller` from `^57.0.0` to `^58.0.0` ([#7011](https://github.com/MetaMask/core/pull/7011))
- **BREAKING:** Bump `@metamask/bridge-status-controller` from `^57.0.0` to `^58.0.0` ([#7011](https://github.com/MetaMask/core/pull/7011))

## [1.0.0]

### Added

- Initial release ([#6820](https://github.com/MetaMask/core/pull/6820))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@10.0.0...HEAD
[10.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@9.0.0...@metamask/transaction-pay-controller@10.0.0
[9.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@8.0.0...@metamask/transaction-pay-controller@9.0.0
[8.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@7.0.0...@metamask/transaction-pay-controller@8.0.0
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@6.0.0...@metamask/transaction-pay-controller@7.0.0
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@5.0.0...@metamask/transaction-pay-controller@6.0.0
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@4.0.0...@metamask/transaction-pay-controller@5.0.0
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@3.1.0...@metamask/transaction-pay-controller@4.0.0
[3.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@3.0.0...@metamask/transaction-pay-controller@3.1.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@2.0.2...@metamask/transaction-pay-controller@3.0.0
[2.0.2]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@2.0.1...@metamask/transaction-pay-controller@2.0.2
[2.0.1]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@2.0.0...@metamask/transaction-pay-controller@2.0.1
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@1.0.0...@metamask/transaction-pay-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/transaction-pay-controller@1.0.0
