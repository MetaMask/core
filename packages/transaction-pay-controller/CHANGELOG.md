# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [16.1.0]

### Added

- Add `metaMask` fee field to `TransactionPayFees` ([#8030](https://github.com/MetaMask/core/pull/8030))
- Add ordered strategy fallback mechanism for quote retrieval ([#7868](https://github.com/MetaMask/core/pull/7868))

### Changed

- Bump `@metamask/transaction-controller` from `^62.18.0` to `^62.19.0` ([#8031](https://github.com/MetaMask/core/pull/8031))
- Bump `@metamask/bridge-controller` from `^67.1.1` to `^67.2.0` ([#8024](https://github.com/MetaMask/core/pull/8024))
- Bump `@metamask/assets-controllers` from `^100.0.2` to `^100.0.3` ([#8029](https://github.com/MetaMask/core/pull/8029))

## [16.0.0]

### Added

- **BREAKING:** Add live on-chain balance validation for pay transactions ([#7935](https://github.com/MetaMask/core/pull/7935))
  - Refresh payment token balance via chain before each quote update.
  - Validate source token balance via chain before submitting Relay deposits.
  - Requires `NetworkController:getNetworkClientById` messenger action permission in `TransactionController` publish hook.

### Changed

- Bump `@metamask/transaction-controller` from `^62.17.1` to `^62.18.0` ([#8005](https://github.com/MetaMask/core/pull/8005))
- Replace `relayDeposit` transaction type with `predictRelayDeposit` or `perpsRelayDeposit` based on the parent transaction type ([#7947](https://github.com/MetaMask/core/pull/7947))
- Bump `@metamask/assets-controllers` from `^100.0.1` to `^100.0.2` ([#8004](https://github.com/MetaMask/core/pull/8004))

## [15.1.2]

### Changed

- Bump `@metamask/assets-controllers` from `^100.0.0` to `^100.0.1` ([#7996](https://github.com/MetaMask/core/pull/7996))
- Bump `@metamask/bridge-controller` from `^67.1.0` to `^67.1.1` ([#7996](https://github.com/MetaMask/core/pull/7996))
- Bump `@metamask/bridge-status-controller` from `^67.0.0` to `^67.0.1` ([#7996](https://github.com/MetaMask/core/pull/7996))
- Bump `@metamask/gas-fee-controller` from `^26.0.2` to `^26.0.3` ([#7996](https://github.com/MetaMask/core/pull/7996))
- Bump `@metamask/network-controller` from `^29.0.0` to `^30.0.0` ([#7996](https://github.com/MetaMask/core/pull/7996))
- Bump `@metamask/transaction-controller` from `^62.17.0` to `^62.17.1` ([#7996](https://github.com/MetaMask/core/pull/7996))

## [15.1.1]

### Changed

- Bump `@metamask/assets-controllers` from `^99.4.0` to `^100.0.0` ([#7995](https://github.com/MetaMask/core/pull/7995))
- Bump `@metamask/controller-utils` from `^11.18.0` to `^11.19.0` ([#7995](https://github.com/MetaMask/core/pull/7995))
- Bump `@metamask/bridge-controller` from `^67.0.0` to `^67.1.0` ([#7995](https://github.com/MetaMask/core/pull/7995))

## [15.1.0]

### Changed

- Bump `@metamask/bridge-controller` from `^66.1.1` to `^67.0.0` ([#7956](https://github.com/MetaMask/core/pull/7956), [#7961](https://github.com/MetaMask/core/pull/7961))
- Bump `@metamask/bridge-status-controller` from `^66.0.2` to `^67.0.0` ([#7956](https://github.com/MetaMask/core/pull/7956), [#7961](https://github.com/MetaMask/core/pull/7961))
- Bump `@metamask/assets-controllers` from `^99.3.2` to `^99.4.0` ([#7944](https://github.com/MetaMask/core/pull/7944))

## [15.0.1]

### Fixed

- Estimate relay transactions separately and combine with original transaction gas at quote time ([#7933](https://github.com/MetaMask/core/pull/7933))

## [15.0.0]

### Changed

- **BREAKING:** Remove `transactionGas` from `TransactionPayFees` ([#7929](https://github.com/MetaMask/core/pull/7929))
  - The original transaction's gas cost is now included in `sourceNetwork` for post-quote flows instead of being reported separately, so gas estimation and gas-fee-token detection cover both the Relay deposit and the user's original transaction

## [14.0.0]

### Changed

- **BREAKING:** Add subsidized fee to Relay quote target amount if `isMaxAmount` ([#7911](https://github.com/MetaMask/core/pull/7911))
  - Remove `human` and `raw` from `targetAmount` on `TransactionPayQuote` and `TransactionPayTotals`
  - Use `amountFormatted` as USD value for Relay quote target amount and subsidized fee when token is a stablecoin
  - Set provider fee to zero when subsidized fee is present
  - Add MUSD, USDC, USDT, and Hypercore USDC to stablecoins

## [13.0.0]

### Added

- Add post-quote transaction support for withdrawal flows ([#7783](https://github.com/MetaMask/core/pull/7783))
  - Add `setTransactionConfig` method replacing `setIsMaxAmount` and `setIsPostQuote`
  - Add `TransactionConfig`, `TransactionConfigCallback` types
  - Add `isPostQuote` to `TransactionData` and `QuoteRequest`
  - Support reversed source/destination in Relay quotes for post-quote flows
  - Add same-token-same-chain skip logic for post-quote transactions
  - Add source amount fields (`sourceBalanceRaw`, `sourceChainId`, `sourceTokenAddress`) to `TransactionPaySourceAmount`

### Changed

- Bump `@metamask/bridge-controller` from `^65.3.0` to `^66.1.1` ([#7862](https://github.com/MetaMask/core/pull/7862), [#7897](https://github.com/MetaMask/core/pull/7897), [#7910](https://github.com/MetaMask/core/pull/7910))
- Bump `@metamask/transaction-controller` from `^62.14.0` to `^62.17.0` ([#7854](https://github.com/MetaMask/core/pull/7854), [#7872](https://github.com/MetaMask/core/pull/7872), [#7897](https://github.com/MetaMask/core/pull/7897))
- Bump `@metamask/assets-controllers` from `^99.2.0` to `^99.3.2` ([#7855](https://github.com/MetaMask/core/pull/7855), [#7860](https://github.com/MetaMask/core/pull/7860)), ([#7897](https://github.com/MetaMask/core/pull/7897))
- Bump `@metamask/bridge-status-controller` from `66.0.0` to `66.0.2` ([#7897](https://github.com/MetaMask/core/pull/7897), [#7910](https://github.com/MetaMask/core/pull/7910))

### Removed

- **BREAKING:** Remove `setIsMaxAmount` method in favor of `setTransactionConfig` ([#7783](https://github.com/MetaMask/core/pull/7783))

## [12.2.0]

### Added

- Generate required tokens using `requiredAssets` from transaction metadata ([#7820](https://github.com/MetaMask/core/pull/7820))

### Changed

- Bump `@metamask/bridge-controller` from `^65.2.0` to `^65.3.0` ([#7837](https://github.com/MetaMask/core/pull/7837))
- Bump `@metamask/bridge-status-controller` from `^65.0.1` to `^66.0.0` ([#7850](https://github.com/MetaMask/core/pull/7850))

## [12.1.0]

### Changed

- Bump `@metamask/transaction-controller` from `^62.11.0` to `^62.14.0` ([#7775](https://github.com/MetaMask/core/pull/7775), [#7802](https://github.com/MetaMask/core/pull/7802), [#7832](https://github.com/MetaMask/core/pull/7832))
- Bump `@metamask/assets-controllers` from `^99.1.0` to `^99.2.0` ([#7802](https://github.com/MetaMask/core/pull/7802))
- Bump `@metamask/bridge-controller` from `^65.1.0` to `^65.2.0` ([#7802](https://github.com/MetaMask/core/pull/7802))
- Poll Relay status for same-chain quotes with a single deposit step ([#7761](https://github.com/MetaMask/core/pull/7761))

## [12.0.2]

### Changed

- Bump `@metamask/assets-controllers` from `^99.0.0` to `^99.1.0` ([#7771](https://github.com/MetaMask/core/pull/7771))
- Bump `@metamask/bridge-controller` from `^65.0.1` to `^65.1.0` ([#7763](https://github.com/MetaMask/core/pull/7763))
- Bump `@metamask/bridge-status-controller` from `^65.0.0` to `^65.0.1` ([#7763](https://github.com/MetaMask/core/pull/7763))
- Bump `@metamask/transaction-controller` from `^62.10.0` to `^62.11.0` ([#7760](https://github.com/MetaMask/core/pull/7760))

### Fixed

- Skip gas fee token in Relay strategy if chain does not support EIP-7702 ([#7754](https://github.com/MetaMask/core/pull/7754))

## [12.0.1]

### Changed

- Bump `@metamask/assets-controllers` from `^98.0.0` to `^99.0.0` ([#7751](https://github.com/MetaMask/core/pull/7751))
- Bump `@metamask/bridge-controller` from `^65.0.0` to `^65.0.1` ([#7751](https://github.com/MetaMask/core/pull/7751))
- Bump `@metamask/transaction-controller` from `^62.9.2` to `^62.10.0` ([#7737](https://github.com/MetaMask/core/pull/7737))

## [12.0.0]

### Changed

- Bump `@metamask/assets-controllers` from `^97.0.0` to `^98.0.0` ([#7731](https://github.com/MetaMask/core/pull/7731))
- Bump `@metamask/bridge-controller` from `^64.8.2` to `^65.0.0` ([#7731](https://github.com/MetaMask/core/pull/7731))
- Bump `@metamask/bridge-status-controller` from `^64.4.4` to `^64.4.5` ([#7724](https://github.com/MetaMask/core/pull/7724))

## [11.1.1]

### Changed

- Bump `@metamask/assets-controllers` from `^96.0.0` to `^97.0.0` ([#7722](https://github.com/MetaMask/core/pull/7722))
- Bump `@metamask/bridge-controller` from `^64.8.1` to `^64.8.2` ([#7722](https://github.com/MetaMask/core/pull/7722))

## [11.1.0]

### Added

- Add `slippageTokens` feature flag support for token-specific slippage configuration ([#7673](https://github.com/MetaMask/core/pull/7673))

### Changed

- Bump `@metamask/bridge-controller` from `^64.5.1` to `^64.8.1` ([#7667](https://github.com/MetaMask/core/pull/7667), [#7672](https://github.com/MetaMask/core/pull/7672), [#7694](https://github.com/MetaMask/core/pull/7694), [#7700](https://github.com/MetaMask/core/pull/7700), [#7704](https://github.com/MetaMask/core/pull/7704))
- Bump `@metamask/assets-controllers` from `^95.3.0` to `^96.0.0` ([#7704](https://github.com/MetaMask/core/pull/7704))
- Bump `@metamask/bridge-status-controller` from `^64.4.3` to `^64.4.4` ([#7704](https://github.com/MetaMask/core/pull/7704))

## [11.0.2]

### Changed

- Bump `@metamask/assets-controllers` from `^95.1.0` to `^95.3.0` ([#7622](https://github.com/MetaMask/core/pull/7622), [#7642](https://github.com/MetaMask/core/pull/7642))
- Bump `@metamask/bridge-controller` from `^64.4.1` to `^64.5.1` ([#7622](https://github.com/MetaMask/core/pull/7622), [#7642](https://github.com/MetaMask/core/pull/7642))
- Bump `@metamask/bridge-status-controller` from `^64.4.2` to `^64.4.3` ([#7642](https://github.com/MetaMask/core/pull/7642))
- Bump `@metamask/gas-fee-controller` from `^26.0.1` to `^26.0.2` ([#7642](https://github.com/MetaMask/core/pull/7642))
- Bump `@metamask/network-controller` from `^28.0.0` to `^29.0.0` ([#7642](https://github.com/MetaMask/core/pull/7642))
- Bump `@metamask/transaction-controller` from `^62.9.1` to `^62.9.2` ([#7642](https://github.com/MetaMask/core/pull/7642))

## [11.0.1]

### Changed

- Bump `@metamask/network-controller` from `^27.2.0` to `^28.0.0` ([#7604](https://github.com/MetaMask/core/pull/7604))
- Bump `@metamask/bridge-controller` from `^64.4.0` to `^64.4.1` ([#7604](https://github.com/MetaMask/core/pull/7604))
- Bump `@metamask/bridge-status-controller` from `^64.4.1` to `^64.4.2` ([#7604](https://github.com/MetaMask/core/pull/7604))
- Bump `@metamask/gas-fee-controller` from `^26.0.0` to `^26.0.1` ([#7604](https://github.com/MetaMask/core/pull/7604))
- Bump `@metamask/transaction-controller` from `^62.9.0` to `^62.9.1` ([#7604](https://github.com/MetaMask/core/pull/7604))

## [11.0.0]

### Added

- **BREAKING:** Support max amount quotes ([#7562](https://github.com/MetaMask/core/pull/7562))
  - Add `TransactionPayController:setIsMaxAmount` messenger action.
  - Add `isMaxAmount` property to `TransactionData` type.
  - Add `targetAmount` property to `TransactionPayQuote` and `TransactionPayTotals`.
  - Update Relay quote requests to use `EXACT_INPUT` trade type when max amount is selected.
  - Update totals calculation to account for max amount selection.

### Changed

- Bump `@metamask/controller-utils` from `^11.17.0` to `^11.18.0` ([#7583](https://github.com/MetaMask/core/pull/7583))
- Bump `@metamask/network-controller` from `^27.1.0` to `^27.2.0` ([#7583](https://github.com/MetaMask/core/pull/7583))
- Bump `@metamask/assets-controllers` from `^94.0.0` to `^95.1.0` ([#7584](https://github.com/MetaMask/core/pull/7584), [#7600](https://github.com/MetaMask/core/pull/7600))
- Bump `@metamask/transaction-controller` from `^62.7.0` to `^62.9.0` ([#7596](https://github.com/MetaMask/core/pull/7596), [#7602](https://github.com/MetaMask/core/pull/7602))
- Bump `@metamask/bridge-controller` from `^64.3.0` to `^64.4.0` ([#7596](https://github.com/MetaMask/core/pull/7596))
- Bump `@metamask/bridge-status-controller` from `^64.3.0` to `^64.4.1` ([#7596](https://github.com/MetaMask/core/pull/7596), [#7597](https://github.com/MetaMask/core/pull/7597))

## [10.6.0]

### Added

- feat: add override functionality to remote feature flags ([#7271](https://github.com/MetaMask/core/pull/7271))

### Changed

- Bump `@metamask/remote-feature-flag-controller` from `^3.1.0` to `^4.0.0` ([#7546](https://github.com/MetaMask/core/pull/7546))
- Upgrade `@metamask/utils` from `^11.8.1` to `^11.9.0` ([#7511](https://github.com/MetaMask/core/pull/7511))
- Poll relay status using static URL ([#7535](https://github.com/MetaMask/core/pull/7535))
- Bump `@metamask/assets-controllers` from `^93.1.0` to `^94.1.0` ([#7444](https://github.com/MetaMask/core/pull/7444), [#7488](https://github.com/MetaMask/core/pull/7488))
- Bump `@metamask/transaction-controller` from `^62.6.0` to `^62.7.0` ([#7494](https://github.com/MetaMask/core/pull/7494))
- Bump `@metamask/bridge-controller` from `^64.1.0` to `^64.3.0` ([#7509](https://github.com/MetaMask/core/pull/7509), [#7574](https://github.com/MetaMask/core/pull/7574))
- Bump `@metamask/bridge-status-controller` from `^64.1.0` to `^64.3.0` ([#7509](https://github.com/MetaMask/core/pull/7509), [#7574](https://github.com/MetaMask/core/pull/7574))
- Bump `@metamask/remote-feature-flag-controller` from `^3.0.0` to `^3.1.0` ([#7519](https://github.com/MetaMask/core/pull/7519))
- Bump `@metamask/network-controller` from `^27.0.0` to `^27.1.0` ([#7534](https://github.com/MetaMask/core/pull/7534))
- Bump `@metamask/controller-utils` from `^11.16.0` to `^11.17.0` ([#7534](https://github.com/MetaMask/core/pull/7534))

## [10.5.0]

### Changed

- Bump `@metamask/transaction-controller` from `^62.5.0` to `^62.6.0` ([#7430](https://github.com/MetaMask/core/pull/7430))
- Bump `@metamask/bridge-controller` from `^64.0.0` to `^64.1.0` ([#7422](https://github.com/MetaMask/core/pull/7422))
- Estimate gas for Relay quotes using messenger actions ([#7405](https://github.com/MetaMask/core/pull/7405))
  - Submit all Relay source transactions using same gas limits estimated from quote.

## [10.4.0]

### Changed

- Bump `@metamask/transaction-controller` from `^62.4.0` to `^62.5.0` ([#7325](https://github.com/MetaMask/core/pull/7325))
- Bump `@metamask/bridge-status-controller` from `^63.1.0` to `^64.0.1` ([#7295](https://github.com/MetaMask/core/pull/7295), [#7307](https://github.com/MetaMask/core/pull/7307))
- Bump `@metamask/bridge-controller` from `^63.2.0` to `^64.0.0` ([#7295](https://github.com/MetaMask/core/pull/7295))
- Skip delegation in Relay quotes if token transfer only ([#7262](https://github.com/MetaMask/core/pull/7262))
- Bump `@metamask/assets-controllers` from `^92.0.0` to `^93.1.0` ([#7291](https://github.com/MetaMask/core/pull/7291), [#7309](https://github.com/MetaMask/core/pull/7309))
- Bump `@metamask/remote-feature-flag-controller` from `^2.0.1` to `^3.0.0` ([#7309](https://github.com/MetaMask/core/pull/7309)

### Fixed

- Fix source network fees for batch Relay deposits on EIP-7702 networks ([#7323](https://github.com/MetaMask/core/pull/7323))
- Improve Relay provider fees ([#7313](https://github.com/MetaMask/core/pull/7313))
  - Include slippage from feature flag.
  - Read fee from `totalImpact` property.
  - Send dust in transaction quotes to token transfer recipient, if available.

## [10.3.0]

### Changed

- Use `overwriteUpgrade` when adding transaction batches in Relay strategy ([#7282](https://github.com/MetaMask/core/pull/7282))
- Bump `@metamask/network-controller` from `^26.0.0` to `^27.0.0` ([#7258](https://github.com/MetaMask/core/pull/7258))
- Bump `@metamask/transaction-controller` from `^62.3.1` to `^62.4.0` ([#7289](https://github.com/MetaMask/core/pull/7289))

### Fixed

- Include `authorizationList` in Relay deposit tranasction if source and target chain are the same, and EIP-7702 upgrade is needed ([#7281](https://github.com/MetaMask/core/pull/7281))

## [10.2.0]

### Added

- Use `relayDisabledGasStationChains` feature flag to disable gas station on specific source chains in Relay strategy ([#7255](https://github.com/MetaMask/core/pull/7255))

### Changed

- Bump `@metamask/assets-controllers` from `^91.0.0` to `^92.0.0` ([#7253](https://github.com/MetaMask/core/pull/7253))
- Bump `@metamask/bridge-status-controller` from `^63.0.0` to `^63.1.0` ([#7245](https://github.com/MetaMask/core/pull/7245))
- Bump `@metamask/transaction-controller` from `^62.2.0` to `^62.3.1` ([#7236](https://github.com/MetaMask/core/pull/7236), [#7257](https://github.com/MetaMask/core/pull/7257))
- Bump `@metamask/bridge-controller` from `^63.0.0` to `^63.2.0` ([#7238](https://github.com/MetaMask/core/pull/7238), [#7245](https://github.com/MetaMask/core/pull/7245))

## [10.1.0]

### Added

- Use new feature flags to configure gas limit fallback for Relay quotes ([#7229](https://github.com/MetaMask/core/pull/7229))
  - Use gas fee properties from Relay quotes.

### Changed

- Move peer dependencies for controller and service packages to direct dependencies ([#7209](https://github.com/MetaMask/core/pull/7209), [#7220](https://github.com/MetaMask/core/pull/7220))
  - The dependencies moved are:
    - `@metamask/assets-controllers` (^91.0.0)
    - `@metamask/bridge-controller` (^63.0.0)
    - `@metamask/bridge-status-controller` (^63.0.0)
    - `@metamask/gas-fee-controller` (^26.0.0)
    - `@metamask/network-controller` (^26.0.0)
    - `@metamask/remote-feature-flag-controller` (^2.0.1)
    - `@metamask/transaction-controller` (^62.2.0)
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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@16.1.0...HEAD
[16.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@16.0.0...@metamask/transaction-pay-controller@16.1.0
[16.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@15.1.2...@metamask/transaction-pay-controller@16.0.0
[15.1.2]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@15.1.1...@metamask/transaction-pay-controller@15.1.2
[15.1.1]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@15.1.0...@metamask/transaction-pay-controller@15.1.1
[15.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@15.0.1...@metamask/transaction-pay-controller@15.1.0
[15.0.1]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@15.0.0...@metamask/transaction-pay-controller@15.0.1
[15.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@14.0.0...@metamask/transaction-pay-controller@15.0.0
[14.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@13.0.0...@metamask/transaction-pay-controller@14.0.0
[13.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@12.2.0...@metamask/transaction-pay-controller@13.0.0
[12.2.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@12.1.0...@metamask/transaction-pay-controller@12.2.0
[12.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@12.0.2...@metamask/transaction-pay-controller@12.1.0
[12.0.2]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@12.0.1...@metamask/transaction-pay-controller@12.0.2
[12.0.1]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@12.0.0...@metamask/transaction-pay-controller@12.0.1
[12.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@11.1.1...@metamask/transaction-pay-controller@12.0.0
[11.1.1]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@11.1.0...@metamask/transaction-pay-controller@11.1.1
[11.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@11.0.2...@metamask/transaction-pay-controller@11.1.0
[11.0.2]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@11.0.1...@metamask/transaction-pay-controller@11.0.2
[11.0.1]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@11.0.0...@metamask/transaction-pay-controller@11.0.1
[11.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@10.6.0...@metamask/transaction-pay-controller@11.0.0
[10.6.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@10.5.0...@metamask/transaction-pay-controller@10.6.0
[10.5.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@10.4.0...@metamask/transaction-pay-controller@10.5.0
[10.4.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@10.3.0...@metamask/transaction-pay-controller@10.4.0
[10.3.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@10.2.0...@metamask/transaction-pay-controller@10.3.0
[10.2.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@10.1.0...@metamask/transaction-pay-controller@10.2.0
[10.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@10.0.0...@metamask/transaction-pay-controller@10.1.0
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
