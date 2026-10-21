# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release ([#10786](https://github.com/MetaMask/core/pull/10786))
  - Add `walletPay`, the handler for the `wallet_pay` JSON-RPC method, which lets a connected dapp request a MetaMask Pay transaction and resolves with its `transactionHash`.
  - Support the `perpsDeposit` and `perpsWithdraw` types.
  - Gate each type per site with the `confirmations_pay_rpc` remote feature flag.
  - Add the `TransactionPayMiddlewareMessenger`, `WalletPayHooks`, `WalletPayJsonRpcRequest` and `WalletPayResult` types.

[Unreleased]: https://github.com/MetaMask/core/
