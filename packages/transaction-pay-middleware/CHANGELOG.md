# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0]

### Added

- Initial release ([#10786](https://github.com/MetaMask/core/pull/10786))
  - Add `walletPay`, the handler for the `wallet_pay` JSON-RPC method, which lets a connected dapp request a MetaMask Pay transaction and resolves with its `transactionHash`.
  - Support the `perpsDeposit` and `perpsWithdraw` types.
  - Gate each type per site with the `confirmations_pay_rpc` remote feature flag.
  - Add the `TransactionPayMiddlewareMessenger`, `WalletPayHooks`, `WalletPayJsonRpcRequest` and `WalletPayResult` types.

### Changed

- Bump `@metamask/network-controller` from `^37.1.0` to `^37.1.1` ([#10982](https://github.com/MetaMask/core/pull/10982))
- Bump `@metamask/perps-controller` from `^20.1.0` to `^21.0.0` ([#10988](https://github.com/MetaMask/core/pull/10988))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-middleware@1.0.0...HEAD
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/transaction-pay-middleware@1.0.0
