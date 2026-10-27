# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0]

### Uncategorized

- test: use import.meta.dirname in Vitest configs ([#11082](https://github.com/MetaMask/core/pull/11082))
- test: run network-controller on Vitest ([#10873](https://github.com/MetaMask/core/pull/10873))
- test: run confirmations packages on Vitest ([#10978](https://github.com/MetaMask/core/pull/10978))

### Added

- Add support for Node.js 26 ([#10981](https://github.com/MetaMask/core/pull/10981))
- Accept a zero `amount` for `perpsWithdraw`, which opens the confirmation without a prefilled amount, like omitting `amount` ([#11114](https://github.com/MetaMask/core/pull/11114))
  - Add the optional `allowZeroAmount` property to `WalletPayFlow`.

### Changed

- **BREAKING:** `wallet_pay` now selects the requested account before adding the transaction, once the request has passed every check ([#11109](https://github.com/MetaMask/core/pull/11109))
  - The messenger must now allow `AccountsController:getAccountByAddress`, `AccountsController:getSelectedAccount` and `AccountTreeController:setSelectedAccountGroupByAccountId`.
  - A request whose `from` is not a known account is rejected with `4100`.
- Add dependencies `@metamask/accounts-controller` (`^40.1.0`) and `@metamask/account-tree-controller` (`^11.2.0`) ([#11109](https://github.com/MetaMask/core/pull/11109))
- Bump `@metamask/perps-controller` from `^21.0.0` to `^22.0.0` ([#11029](https://github.com/MetaMask/core/pull/11029))
- Bump `@metamask/utils` from `^12.0.0` to `^12.0.1` ([#11107](https://github.com/MetaMask/core/pull/11107))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-middleware@2.0.0...HEAD
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-middleware@1.0.0...@metamask/transaction-pay-middleware@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/transaction-pay-middleware@1.0.0
