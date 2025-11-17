# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@7.0.0...HEAD
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
