# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [25.1.1]

### Changed

- Bump `@metamask/transaction-controller` from `^69.5.0` to `^69.6.1` ([#9798](https://github.com/MetaMask/core/pull/9798), [#9823](https://github.com/MetaMask/core/pull/9823), [#9960](https://github.com/MetaMask/core/pull/9960), [#9969](https://github.com/MetaMask/core/pull/9969))
- Bump `@metamask/superstruct` from `^3.1.0` to `^3.4.1` ([#9754](https://github.com/MetaMask/core/pull/9754))
- Bump `@metamask/remote-feature-flag-controller` from `^5.0.0` to `^6.0.0` ([#9945](https://github.com/MetaMask/core/pull/9945))
- Bump `@metamask/network-controller` from `^35.0.1` to `^36.0.0` ([#9969](https://github.com/MetaMask/core/pull/9969))

## [25.1.0]

### Changed

- Add Robinhood mainnet tx-sentinel URL ([#9783](https://github.com/MetaMask/core/pull/9783))
- Bump `@metamask/transaction-controller` from `^69.4.0` to `^69.5.0` ([#9780](https://github.com/MetaMask/core/pull/9780))
- Bump `@metamask/superstruct` from `^3.1.0` to `^3.4.1` ([#9754](https://github.com/MetaMask/core/pull/9754))

## [25.0.3]

### Changed

- Bump `@metamask/network-controller` from `^35.0.0` to `^35.0.1` ([#9758](https://github.com/MetaMask/core/pull/9758))
- Bump `@metamask/profile-sync-controller` from `^28.3.0` to `^29.0.0` ([#9779](https://github.com/MetaMask/core/pull/9779))

## [25.0.2]

### Changed

- Bump `@metamask/transaction-controller` from `^69.0.0` to `^69.4.0` ([#9568](https://github.com/MetaMask/core/pull/9568), [#9589](https://github.com/MetaMask/core/pull/9589), [#9593](https://github.com/MetaMask/core/pull/9593), [#9693](https://github.com/MetaMask/core/pull/9693), [#9735](https://github.com/MetaMask/core/pull/9735))
- Bump `@metamask/network-controller` from `^34.0.0` to `^35.0.0` ([#9735](https://github.com/MetaMask/core/pull/9735))
- Bump `@metamask/polling-controller` from `^16.0.8` to `^16.0.9` ([#9735](https://github.com/MetaMask/core/pull/9735))
- Bump `@metamask/remote-feature-flag-controller` from `^4.2.2` to `^5.0.0` ([#9735](https://github.com/MetaMask/core/pull/9735))

## [25.0.1]

### Changed

- Bump `@metamask/transaction-controller` from `^68.3.0` to `^69.0.0` ([#9456](https://github.com/MetaMask/core/pull/9456), [#9470](https://github.com/MetaMask/core/pull/9470))
- Bump `@metamask/profile-sync-controller` from `^28.2.0` to `^28.3.0` ([#9463](https://github.com/MetaMask/core/pull/9463))

## [25.0.0]

### Changed

- **BREAKING:** Fail the associated regular transaction via the new `TransactionController:failTransaction` action instead of `TransactionController:updateTransaction` when a smart transaction is cancelled ([#9400](https://github.com/MetaMask/core/pull/9400))
  - Consumers must now grant the smart transactions controller messenger access to the `TransactionController:failTransaction` action (previously `TransactionController:updateTransaction`).
  - `updateTransaction` only patches state and does not emit transaction lifecycle events, so consumers that react to `transactionFailed`/`transactionStatusUpdated` (e.g. the bridge status controller and metrics) were never notified, leaving cancelled smart transactions — such as bridges — stuck as pending indefinitely.
- Bump `@metamask/messenger` from `^1.2.0` to `^2.0.0` ([#9392](https://github.com/MetaMask/core/pull/9392))
- Bump `@metamask/transaction-controller` from `^68.2.2` to `^68.3.0` ([#9421](https://github.com/MetaMask/core/pull/9421))

## [24.2.4]

### Changed

- Bump `@metamask/transaction-controller` from `^68.1.1` to `^68.2.2` ([#9253](https://github.com/MetaMask/core/pull/9253), [#9337](https://github.com/MetaMask/core/pull/9337), [#9349](https://github.com/MetaMask/core/pull/9349))
- Bump `@metamask/network-controller` from `^33.0.0` to `^34.0.0` ([#9349](https://github.com/MetaMask/core/pull/9349))
- Bump `@metamask/polling-controller` from `^16.0.7` to `^16.0.8` ([#9349](https://github.com/MetaMask/core/pull/9349))

## [24.2.3]

### Changed

- Bump `@metamask/transaction-controller` from `^68.0.1` to `^68.1.1` ([#9203](https://github.com/MetaMask/core/pull/9203), [#9218](https://github.com/MetaMask/core/pull/9218))
- Bump `@metamask/controller-utils` from `^12.2.0` to `^12.3.0` ([#9218](https://github.com/MetaMask/core/pull/9218))
- Bump `@metamask/network-controller` from `^32.0.0` to `^33.0.0` ([#9218](https://github.com/MetaMask/core/pull/9218))
- Bump `@metamask/polling-controller` from `^16.0.6` to `^16.0.7` ([#9218](https://github.com/MetaMask/core/pull/9218))

## [24.2.2]

### Changed

- This package was migrated from `MetaMask/smart-transactions-controller` to the `MetaMask/core` monorepo ([#9139](https://github.com/MetaMask/core/pull/9139))
  - See [MetaMask/smart-transactions-controller](https://github.com/MetaMask/smart-transactions-controller/blob/main/CHANGELOG.md) for the original changelog.
- Bump `@metamask/transaction-controller` from `^68.0.0` to `^68.0.1` ([#9177](https://github.com/MetaMask/core/pull/9177))
- Drop unused dependencies `@ethereumjs/tx`, `@ethereumjs/util`, and `fast-json-patch` ([#9139](https://github.com/MetaMask/core/pull/9139))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/smart-transactions-controller@25.1.1...HEAD
[25.1.1]: https://github.com/MetaMask/core/compare/@metamask/smart-transactions-controller@25.1.0...@metamask/smart-transactions-controller@25.1.1
[25.1.0]: https://github.com/MetaMask/core/compare/@metamask/smart-transactions-controller@25.0.3...@metamask/smart-transactions-controller@25.1.0
[25.0.3]: https://github.com/MetaMask/core/compare/@metamask/smart-transactions-controller@25.0.2...@metamask/smart-transactions-controller@25.0.3
[25.0.2]: https://github.com/MetaMask/core/compare/@metamask/smart-transactions-controller@25.0.1...@metamask/smart-transactions-controller@25.0.2
[25.0.1]: https://github.com/MetaMask/core/compare/@metamask/smart-transactions-controller@25.0.0...@metamask/smart-transactions-controller@25.0.1
[25.0.0]: https://github.com/MetaMask/core/compare/@metamask/smart-transactions-controller@24.2.4...@metamask/smart-transactions-controller@25.0.0
[24.2.4]: https://github.com/MetaMask/core/compare/@metamask/smart-transactions-controller@24.2.3...@metamask/smart-transactions-controller@24.2.4
[24.2.3]: https://github.com/MetaMask/core/compare/@metamask/smart-transactions-controller@24.2.2...@metamask/smart-transactions-controller@24.2.3
[24.2.2]: https://github.com/MetaMask/core/releases/tag/@metamask/smart-transactions-controller@24.2.2
