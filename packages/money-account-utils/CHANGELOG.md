# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add mUSD token constants and guards, ported from MetaMask Mobile ([#9397](https://github.com/MetaMask/core/pull/9397))
  - Constants: `MUSD_TOKEN` (without client icon assets), `MUSD_DECIMALS`, `MUSD_TOKEN_ADDRESS`, `MUSD_TOKEN_ADDRESS_BY_CHAIN`, `MUSD_TOKEN_ASSET_ID_BY_CHAIN`, `MUSD_CURRENCY`, `MUSD_MONEY_ACCOUNT_CHAIN_IDS`
  - Guards: `isMusdToken`, `isMusdTokenOnChain`, `isMusdOnMoneyAccountChain`
- Add Money Account transaction guards, ported from MetaMask Mobile ([#9397](https://github.com/MetaMask/core/pull/9397))
  - Guards over `TransactionMeta`: `nestedTxWithType`, `isMoneyDepositTx`, `isMoneyWithdrawTx`, `isMoneyAccountTx`, `isSingleRowMusdMoneyWithdraw`, `isPerpsPredictMoneyDeposit`, `isPerpsPredictMoneyWithdraw`, `isPerpsPredictMoneyActivity`, `perpsPredictServiceFamily`
  - MetaMask Pay helpers: `getMMPayChainIds`, `PERPS_PREDICT_DEPOSIT_TYPES`, `PERPS_PREDICT_WITHDRAW_TYPES`
- Add the Money activity list logic, ported from MetaMask Mobile ([#9397](https://github.com/MetaMask/core/pull/9397))
  - Domain types: `AccountsApiActivity`, `MoneyActivityItem`, `MoneyActivityFilter`, `MoneyActivityTitleKey`, `MoneyActivityTransactionMeta` with the `onchainItem`/`accountsApiItem` constructors
  - Accounts-API parsing: `parseAccountsApiActivity`, `oldestRawActivityTime`, `dedupeAccountsApiActivity`, card payment/cashback type constants
  - Merge and pagination gating: `mergeMoneyActivity`, `buildMoneyActivityBuckets`
  - Classification: `classifyMoneyActivity`, `getMoneyActivityStatus`, `moneyActivityLabelKey` and the label-key tables (returns neutral kinds and i18n keys; clients map to their own design system and i18n)
- Add the Money Account vault transaction builders, ported from MetaMask Mobile ([#9397](https://github.com/MetaMask/core/pull/9397))
  - `buildMoneyAccountDepositBatch`, `buildMoneyAccountWithdrawBatch`, `applySlippage`, `getSharesForWithdrawal`, `getMoneyAccountDepositAssetAddress`, `TELLER_ABI`
  - All configuration (vault addresses, provider) is parameter-injected; no client state access
- Add the Money analytics vocabulary, ported from MetaMask Mobile ([#9397](https://github.com/MetaMask/core/pull/9397))
  - Event name enums (`SCREEN_NAMES`, `BOTTOM_SHEET_NAMES`, `COMPONENT_NAMES`, button/tooltip/onboarding enums) and payload types
  - Pure payload builders: `resolveRedirectTargetType`, `withRedirectType` (client URL targets injected), `deriveMoneyActivityTransactionProperties`

[Unreleased]: https://github.com/MetaMask/core/
