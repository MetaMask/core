# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0]

### Added

- Add Money Account transaction batch builders, ported from MetaMask Mobile ([#9680](https://github.com/MetaMask/core/pull/9680))
  - `buildMoneyAccountDepositBatch` builds the approve + deposit call pair, deriving `minimumMint` from the vault lens' `previewDeposit` less a 0.2% slippage tolerance
  - `buildMoneyAccountWithdrawBatch` builds the withdraw + transfer call pair, converting the asset amount to vault shares at the accountant's current rate
  - Both take an `@ethersproject` `Provider` for their read calls, and both throw on a zero amount rather than encoding a call that cannot succeed — a zero-share redemption is rejected by the teller, and a zero-amount deposit mints nothing
  - `buildMoneyAccountDepositPlaceholderBatch` and `buildMoneyAccountWithdrawPlaceholderBatch` resolve their call targets and types without calldata, for placeholder batches that MetaMask Pay re-encodes once the user picks an amount. They perform no vault reads, so they are synchronous and take only `chainId` and `tellerAddress`
  - `getMoneyAccountDepositAssetId` returns the CAIP-19 asset id of the deposit asset for a chain, or `undefined` if mUSD is not deployed there. Clients that want Money Account's Monad-only default apply it at the call site
  - Supporting exports: `applySlippage`, `getSharesForWithdrawal`, `getMoneyAccountDepositAssetAddress`, `TELLER_ABI`, and the `MoneyAccountTxParams`, `MoneyAccountPlaceholderTxParams`, `MoneyAccountDepositBatchResult`, `MoneyAccountDepositPlaceholderBatchResult`, `MoneyAccountWithdrawBatchResult`, `MoneyAccountWithdrawPlaceholderBatchResult`, `BuildMoneyAccountDepositBatchOptions`, `BuildMoneyAccountDepositPlaceholderBatchOptions`, `BuildMoneyAccountWithdrawBatchOptions`, `BuildMoneyAccountWithdrawPlaceholderBatchOptions` types

### Changed

- Type the values of `MUSD_TOKEN_ASSET_ID_BY_CHAIN` as `CaipAssetType` rather than `string` ([#9680](https://github.com/MetaMask/core/pull/9680))
- Bump `@metamask/transaction-controller` from `^69.3.0` to `^69.4.0` ([#9735](https://github.com/MetaMask/core/pull/9735))

## [1.0.0]

### Added

- Add mUSD token constants and guards, ported from MetaMask Mobile ([#9397](https://github.com/MetaMask/core/pull/9397))
  - Constants: `MUSD_TOKEN` (without client icon assets), `MUSD_DECIMALS`, `MUSD_TOKEN_ADDRESS`, `MUSD_TOKEN_ADDRESS_BY_CHAIN`, `MUSD_TOKEN_ASSET_ID_BY_CHAIN`, `MUSD_CURRENCY`, `MUSD_MONEY_ACCOUNT_CHAIN_IDS`
  - Guards: `isMusdToken`, `isMusdTokenOnChain`, `isMusdOnMoneyAccountChain`
- Add `getTokenDisplaySymbol`, ported from MetaMask Mobile, which canonicalises the registry symbol of the mUSD token to its branded casing (`MUSD` → `mUSD`) and passes all other symbols through unchanged ([#9397](https://github.com/MetaMask/core/pull/9397))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/money-account-utils@1.1.0...HEAD
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/money-account-utils@1.0.0...@metamask/money-account-utils@1.1.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/money-account-utils@1.0.0
