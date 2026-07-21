# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Remove `disableUpgrade` from the Money Account vault deposit batch so that freshly-funded fiat accounts that haven't yet been upgraded to EIP-7702 are auto-upgraded instead of failing ([#9567](https://github.com/MetaMask/core/pull/9567))

## [25.0.0]

### Added

- Store a no-op quote (`TransactionPayStrategy.None`) when a payment token is selected but the route needs no conversion, so clients can tell "no conversion needed" apart from "quote missing" ([#9484](https://github.com/MetaMask/core/pull/9484))
- Add `None` value to `TransactionPayStrategy` enum ([#9484](https://github.com/MetaMask/core/pull/9484))

### Changed

- **BREAKING:** Quotes stored in `transactionData` can now contain a single no-op quote with the `none` strategy; clients that read quotes for display, metrics, or publish validation must ignore or handle no-op quotes ([#9484](https://github.com/MetaMask/core/pull/9484))

## [24.1.0]

### Added

- Add `getStablecoins` feature flag reader that resolves the stablecoin list from the `stable-tokens` LaunchDarkly flag, falling back to the hardcoded constant when absent ([#9495](https://github.com/MetaMask/core/pull/9495))
- Add generic signature steps to the server pay strategy, supporting EIP-712 sign-then-POST flows ([#9051](https://github.com/MetaMask/core/pull/9051))
  - Trigger quote refresh when `txParams.to` or `requiredAssets` changes on a transaction, in addition to the existing `txParams.data` trigger

### Changed

- Replace hardcoded `STABLECOINS` usage in `token.ts` and `relay-quotes.ts` with the remotely configurable `getStablecoins(messenger)` lookup ([#9495](https://github.com/MetaMask/core/pull/9495))
- Bump `@metamask/assets-controller` from `^10.2.1` to `^11.0.0` ([#9485](https://github.com/MetaMask/core/pull/9485))
- Bump `@metamask/ramps-controller` from `^16.0.0` to `^17.0.0` ([#9491](https://github.com/MetaMask/core/pull/9491))

## [24.0.3]

### Changed

- Bump `@metamask/ramps-controller` from `^15.1.0` to `^16.0.0` ([#9481](https://github.com/MetaMask/core/pull/9481))
- Update `LICENSE` text ([#9472](https://github.com/MetaMask/core/pull/9472))

## [24.0.2]

### Changed

- Bump `@metamask/transaction-controller` from `^68.4.0` to `^69.0.0`
- Bump `@metamask/assets-controller` from `^10.2.0` to `^10.2.1` ([#9470](https://github.com/MetaMask/core/pull/9470))
- Bump `@metamask/assets-controllers` from `^109.4.0` to `^109.4.1` ([#9470](https://github.com/MetaMask/core/pull/9470))

## [24.0.1]

### Changed

- Bump `@metamask/assets-controller` from `^10.1.0` to `^10.2.0` ([#9450](https://github.com/MetaMask/core/pull/9450))
- Bump `@metamask/assets-controllers` from `^109.3.1` to `^109.4.0` ([#9450](https://github.com/MetaMask/core/pull/9450))
- Bump `@metamask/transaction-controller` from `^68.3.0` to `^68.4.0` ([#9456](https://github.com/MetaMask/core/pull/9456))

## [24.0.0]

### Added

- **BREAKING:** Add an optional `isSubsidized` flag to `GetDelegationTransactionCallback`, send `metamask.executeVersion: 2` on Relay execute quote requests, and include a signed `metamask` envelope on Relay executes ([#9298](https://github.com/MetaMask/core/pull/9298))

### Changed

- Refactor vault deposit utilities into shared `utils/` modules (`chomp`, `ma-vault-deposit`, `relay-post-ma-vault`) to prepare for the Relay Money Account deposit path ([#9303](https://github.com/MetaMask/core/pull/9303))
- Bump `@metamask/messenger` from `^1.2.0` to `^2.0.0` ([#9392](https://github.com/MetaMask/core/pull/9392))
- Bump `@metamask/ramps-controller` from `^15.0.0` to `^15.1.0` ([#9395](https://github.com/MetaMask/core/pull/9395))
- Bump `@metamask/assets-controller` from `^10.0.1` to `^10.1.0` ([#9411](https://github.com/MetaMask/core/pull/9411))
- Bump `@metamask/transaction-controller` from `^68.2.2` to `^68.3.0` ([#9421](https://github.com/MetaMask/core/pull/9421))
- Bump `@metamask/assets-controllers` from `^109.3.0` to `^109.3.1` ([#9429](https://github.com/MetaMask/core/pull/9429))

### Fixed

- Subscribe to all asset event sources (`AssetsController`, `TokensController`, `TokenRatesController`, `CurrencyRateController`) unconditionally instead of picking one based on the unify-state feature flag at construction time ([#9427](https://github.com/MetaMask/core/pull/9427))
  - The flag can flip from disabled to enabled after this controller is constructed (e.g. remote feature flags loading after startup), which previously left the controller subscribed to a source that never fired, causing required tokens to never resolve for transactions started before the flag loaded.

## [23.17.4]

### Fixed

- Allow payment token selection without a local fiat rate for post-quote transactions ([#9361](https://github.com/MetaMask/core/pull/9361))
  - `updatePaymentToken` threw `Payment token not found` when the selected token had no market price or native-currency rate in wallet state, which blocked selecting a withdraw destination token on a chain the wallet does not actively track. For post-quote (withdraw) flows the token now resolves with zeroed fiat rates instead; standard (deposit) flows keep the strict behavior.

## [23.17.3]

### Changed

- Bump `@metamask/assets-controller` from `^9.1.0` to `^10.0.1` ([#9312](https://github.com/MetaMask/core/pull/9312), [#9349](https://github.com/MetaMask/core/pull/9349))
- Bump `@metamask/transaction-controller` from `^68.2.0` to `^68.2.2` ([#9337](https://github.com/MetaMask/core/pull/9337), [#9349](https://github.com/MetaMask/core/pull/9349))
- Bump `@metamask/assets-controllers` from `^109.2.2` to `^109.3.0` ([#9349](https://github.com/MetaMask/core/pull/9349))
- Bump `@metamask/gas-fee-controller` from `^26.2.3` to `^26.2.4` ([#9349](https://github.com/MetaMask/core/pull/9349))
- Bump `@metamask/network-controller` from `^33.0.0` to `^34.0.0` ([#9349](https://github.com/MetaMask/core/pull/9349))

### Removed

- **BREAKING:** Remove Bridge and Test pay strategies and all `@metamask/bridge-controller` / `@metamask/bridge-status-controller` dependencies ([#9335](https://github.com/MetaMask/core/pull/9335))
  - Remove `Bridge` and `Test` values from the `TransactionPayStrategy` enum. Callers passing these to `getStrategy` / `getStrategies` must remove those references.
  - Remove `TransactionPayBridgeQuote` type export.
  - Remove `BridgeController:fetchQuotes`, `BridgeStatusController:submitTx`, `BridgeStatusController:getState` actions and `BridgeStatusControllerStateChangeEvent` event from `TransactionPayControllerMessenger`. Clients must remove the corresponding messenger delegations.

## [23.17.2]

### Changed

- Bump `@metamask/bridge-status-controller` from `^73.0.0` to `^74.0.0` ([#9288](https://github.com/MetaMask/core/pull/9288), [#9307](https://github.com/MetaMask/core/pull/9307))
- Bump `@metamask/bridge-controller` from `^77.0.0` to `^77.1.0` ([#9301](https://github.com/MetaMask/core/pull/9301))

## [23.17.1]

### Fixed

- Preserve `isExternalSign` on gas-sponsored transactions when no Pay quotes exist ([#9279](https://github.com/MetaMask/core/pull/9279))
  - `syncTransaction` previously cleared `isExternalSign` unconditionally when quote fetches returned no results (e.g. same source and target token). For gas-sponsored transactions, `TransactionController` owns this flag based on the Sentinel simulation result; TPC no longer overrides it.

## [23.17.0]

### Added

- Add CHOMP idempotency for direct mUSD vault deposits ([#9267](https://github.com/MetaMask/core/pull/9267))

### Fixed

- Wait for keyring unlock before executing fiat post-ramp second leg ([#9267](https://github.com/MetaMask/core/pull/9267))

## [23.16.1]

### Changed

- Bump `@metamask/ramps-controller` from `^14.3.0` to `^15.0.0` ([#9260](https://github.com/MetaMask/core/pull/9260))

## [23.16.0]

### Added

- Add opt-in HyperLiquid activation-fee handling for Pay withdrawals, gated by the `confirmations_pay_post_quote` feature flag's `hyperliquidActivationFee` config (resolved from `overrides.<transactionType>.hyperliquidActivationFee`, falling back to `default.hyperliquidActivationFee`; with `enabled` and optional `amountUsd` defaulting to `1`) ([#9238](https://github.com/MetaMask/core/pull/9238))
  - When enabled and the HyperCore source account has not yet been activated, the one-time activation fee is reserved from the amount sent to HyperLiquid (so the `sendAsset` step retains enough balance to cover it) and surfaced as part of the provider fee, leaving the displayed withdrawal amount unchanged.

### Changed

- Bump `@metamask/bridge-controller` from `^76.1.0` to `^77.0.0` ([#9256](https://github.com/MetaMask/core/pull/9256))
- Bump `@metamask/bridge-status-controller` from `^72.3.0` to `^73.0.0` ([#9256](https://github.com/MetaMask/core/pull/9256))
- Bump `@metamask/transaction-controller` from `^68.1.1` to `^68.2.0` ([#9253](https://github.com/MetaMask/core/pull/9253))

## [23.15.0]

### Changed

- Bump `@metamask/assets-controller` from `^9.0.2` to `^9.1.0` ([#9244](https://github.com/MetaMask/core/pull/9244))
- Bump `@metamask/assets-controllers` from `^109.2.1` to `^109.2.2` ([#9231](https://github.com/MetaMask/core/pull/9231))
- Bump `@metamask/bridge-controller` from `^76.0.0` to `^76.1.0` ([#9242](https://github.com/MetaMask/core/pull/9242))
- Bump `@metamask/bridge-status-controller` from `^72.2.0` to `^72.3.0` ([#9242](https://github.com/MetaMask/core/pull/9242))

### Fixed

- Require EIP-7702 for direct mUSD vault deposits and ensure transaction ID collection always stops after the batch attempt ([#9240](https://github.com/MetaMask/core/pull/9240))
- Inherit `isGasFeeSponsored` from the parent transaction into same-chain Relay source-network fees and submission options ([#9216](https://github.com/MetaMask/core/pull/9216))
- Skip EIP-7702 upgrade check for direct mUSD vault deposits since the Money Account is always already upgraded on Monad ([#9250](https://github.com/MetaMask/core/pull/9250))

## [23.14.0]

### Changed

- Bump `@metamask/bridge-controller` from `^75.2.1` to `^76.0.0` ([#9225](https://github.com/MetaMask/core/pull/9225))
- Bump `@metamask/bridge-status-controller` from `^72.1.1` to `^72.2.0` ([#9225](https://github.com/MetaMask/core/pull/9225))

## [23.13.1]

### Changed

- Bump `@metamask/bridge-controller` from `^75.1.1` to `^75.2.1` ([#9214](https://github.com/MetaMask/core/pull/9214), [#9218](https://github.com/MetaMask/core/pull/9218))
- Bump `@metamask/assets-controller` from `^9.0.1` to `^9.0.2` ([#9218](https://github.com/MetaMask/core/pull/9218))
- Bump `@metamask/assets-controllers` from `^109.2.0` to `^109.2.1` ([#9218](https://github.com/MetaMask/core/pull/9218))
- Bump `@metamask/bridge-status-controller` from `^72.1.0` to `^72.1.1` ([#9218](https://github.com/MetaMask/core/pull/9218))
- Bump `@metamask/controller-utils` from `^12.2.0` to `^12.3.0` ([#9218](https://github.com/MetaMask/core/pull/9218))
- Bump `@metamask/gas-fee-controller` from `^26.2.2` to `^26.2.3` ([#9218](https://github.com/MetaMask/core/pull/9218))
- Bump `@metamask/network-controller` from `^32.0.0` to `^33.0.0` ([#9218](https://github.com/MetaMask/core/pull/9218))
- Bump `@metamask/transaction-controller` from `^68.1.0` to `^68.1.1` ([#9218](https://github.com/MetaMask/core/pull/9218))

## [23.13.0]

### Changed

- Add RPC method, chain ID, and endpoint type context to transaction pay provider errors ([#9144](https://github.com/MetaMask/core/pull/9144))
- Bump `@metamask/ramps-controller` from `^14.2.0` to `^14.3.0` ([#9199](https://github.com/MetaMask/core/pull/9199))
- Bump `@metamask/assets-controllers` from `^109.1.0` to `^109.2.0` ([#9202](https://github.com/MetaMask/core/pull/9202))
- Bump `@metamask/transaction-controller` from `^68.0.1` to `^68.1.0` ([#9203](https://github.com/MetaMask/core/pull/9203))

### Fixed

- Preserve original error stack traces while prefixing MetaMask Pay, Relay, and Fiat submission errors, and fail closed when Fiat submission has no quote or when Relay or direct mUSD Fiat vault submissions complete without a transaction hash ([#9201](https://github.com/MetaMask/core/pull/9201))

## [23.12.0]

### Changed

- Post-quote source amount filtering no longer bypasses same-token filtering when `isQuoteRequired` is set ([#9194](https://github.com/MetaMask/core/pull/9194))

## [23.11.0]

### Fixed

- Fix relay quote `user` field for post-quote same-chain same-token transfers with an account override ([#9187](https://github.com/MetaMask/core/pull/9187))

## [23.10.0]

### Fixed

- Fix post-quote flow for MM Pay transactions transferring between same chain and tokens when `isQuoteRequired` is set ([#9150](https://github.com/MetaMask/core/pull/9150))

## [23.9.0]

### Added

- Add test-only fiat execution options to bypass fiat on-ramp settlement during local QA by funding the expected fiat asset from a configured account before continuing the normal MM Pay fiat submit flow ([#9161](https://github.com/MetaMask/core/pull/9161))

### Changed

- Bump `@metamask/transaction-controller` from `^68.0.0` to `^68.0.1` ([#9177](https://github.com/MetaMask/core/pull/9177))

### Fixed

- Sync transaction metadata when fiat payment is selected but no payment token is present ([#9158](https://github.com/MetaMask/core/pull/9158))
- Fix direct mUSD fiat Money Account deposits by submitting a sponsored Money Account vault batch after fiat settlement instead of requiring Relay execute ([#9161](https://github.com/MetaMask/core/pull/9161))

## [23.8.0]

### Changed

- Bump `@metamask/keyring-controller` from `^27.0.0` to `^27.1.0` ([#9129](https://github.com/MetaMask/core/pull/9129))

### Fixed

- Mark MM Pay transactions as externally signed when quotes are available ([#9145](https://github.com/MetaMask/core/pull/9145))

## [23.7.0]

### Added

- Add `isQuoteRequired` transaction config parameter to enforce fetching relay quotes even when source and target tokens are identical ([#9117](https://github.com/MetaMask/core/pull/9117))

### Changed

- Bump `@metamask/assets-controllers` from `^109.0.0` to `^109.1.0` ([#9110](https://github.com/MetaMask/core/pull/9110))

### Fixed

- Fix token amount in `buildTokenTransferData` for MM Pay post-quote Money Account transactions when source and target tokens have different decimal places ([#9116](https://github.com/MetaMask/core/pull/9116))

## [23.6.0]

### Added

- Add direct mUSD fiat injection flow for Money Account deposits behind `useFiatMUSDQuoteToInjectForMoneyAccount` feature flag. When enabled, probes fiat providers for mUSD on Monad availability and, if viable, purchases mUSD directly to the Money Account, skipping the ETH-to-mUSD bridge. Falls back to the existing flow when no provider supports the direct route. Also moves `fiatPayment.caipAssetId` assignment into fiat quote functions so the asset ID always matches the quote that succeeded. ([#9080](https://github.com/MetaMask/core/pull/9080))
- Make fiat order polling interval and timeout remotely configurable via `confirmations_pay_fiat.orderPollIntervalMs` and `confirmations_pay_fiat.orderPollTimeoutMs` feature flags ([#9090](https://github.com/MetaMask/core/pull/9090))

### Changed

- Bump `@metamask/assets-controllers` from `^109.0.0` to `^109.1.0` ([#9110](https://github.com/MetaMask/core/pull/9110))
- Bump `@metamask/utils` from `^11.9.0` to `^11.11.0` ([#9074](https://github.com/MetaMask/core/pull/9074))
- Bump `@metamask/assets-controller` from `^9.0.0` to `^9.0.1` ([#9083](https://github.com/MetaMask/core/pull/9083))
- Bump `@metamask/controller-utils` from `^12.1.1` to `^12.2.0` ([#9083](https://github.com/MetaMask/core/pull/9083))
- Bump `@metamask/transaction-controller` from `^67.1.0` to `^68.0.0` ([#9089](https://github.com/MetaMask/core/pull/9089))
- Bump `@metamask/ramps-controller` from `^14.1.1` to `^14.2.0` ([#9105](https://github.com/MetaMask/core/pull/9105))

### Fixed

- Clear stale `fiatPayment.rampsQuote` when a fiat quote fetch fails, preventing the "No quotes" alert from being silently suppressed after a prior successful fetch ([#9073](https://github.com/MetaMask/core/pull/9073))

## [23.5.1]

### Changed

- Bump `@metamask/assets-controller` from `^8.3.3` to `^9.0.0` ([#9078](https://github.com/MetaMask/core/pull/9078))
- Bump `@metamask/assets-controllers` from `^108.6.0` to `^109.0.0` ([#9078](https://github.com/MetaMask/core/pull/9078))
- Bump `@metamask/bridge-controller` from `^75.1.0` to `^75.1.1` ([#9078](https://github.com/MetaMask/core/pull/9078))
- Make fiat-eligible transaction types remotely configurable via `confirmations_pay_fiat.enabledTransactionTypes` feature flag ([#9050](https://github.com/MetaMask/core/pull/9050))

## [23.5.0]

### Changed

- Bump `@metamask/bridge-controller` from `^75.0.0` to `^75.1.0` ([#9072](https://github.com/MetaMask/core/pull/9072))

### Fixed

- Fix request amount used for cases when paymentOverride is defined and also isPostQuote is true ([#9070](https://github.com/MetaMask/core/pull/9070))

## [23.4.0]

### Changed

- Fall back to `FeatureId.PERPS` when calling `BridgeController:fetchQuotes` and the quote does not have a `featureId` ([#8964](https://github.com/MetaMask/core/pull/8964))
- Bump `@metamask/bridge-controller` from `^74.0.0` to `^75.0.0` ([#9066](https://github.com/MetaMask/core/pull/9066))
- Bump `@metamask/bridge-status-controller` from `^72.0.3` to `^72.1.0` ([#9066](https://github.com/MetaMask/core/pull/9066))
- Bump `@metamask/transaction-controller` from `^67.0.0` to `^67.1.0` ([#9066](https://github.com/MetaMask/core/pull/9066))

## [23.3.1]

### Changed

- Bump `@metamask/bridge-controller` from `^73.2.1` to `^74.0.0` ([#9045](https://github.com/MetaMask/core/pull/9045))
- Bump `@metamask/assets-controller` from `^8.3.2` to `^8.3.3` ([#9058](https://github.com/MetaMask/core/pull/9058))
- Bump `@metamask/assets-controllers` from `^108.5.0` to `^108.6.0` ([#9058](https://github.com/MetaMask/core/pull/9058))
- Bump `@metamask/bridge-status-controller` from `^72.0.2` to `^72.0.3` ([#9058](https://github.com/MetaMask/core/pull/9058))
- Bump `@metamask/controller-utils` from `^12.1.0` to `^12.1.1` ([#9058](https://github.com/MetaMask/core/pull/9058))
- Bump `@metamask/keyring-controller` from `^26.0.0` to `^27.0.0` ([#9058](https://github.com/MetaMask/core/pull/9058))

## [23.3.0]

### Changed

- Fix fiat `moneyAccountDeposit` failing after on-ramp settlement by adding `getAmountData` callback for calldata re-encoding, correcting wallet address, quote amount, slippage validation, and switching to a three-phase relay flow with fee-as-buffer strategy; simple deposits (Perps, Predict) skip to a single EXACT_INPUT relay quote for cheaper fees ([#8987](https://github.com/MetaMask/core/pull/8987))

## [23.2.0]

### Added

- Adding processing for postQuote transactions with paymentOverride defined ([#8967](https://github.com/MetaMask/core/pull/8967))
- Add `@metamask/keyring-controller` `^26.0.0` as a dependency ([#8972](https://github.com/MetaMask/core/pull/8972))
  - The package was already imported at runtime by `src/strategy/relay/hyperliquid-withdraw.ts` but wasn't declared in `package.json`; this PR fixes the omission.

### Changed

- Fiat quote submission now treats the provider code (e.g. `transak-native`) as the canonical form when resolving the provider from a ramps quote, while continuing to accept the legacy path form (e.g. `/providers/transak-native`) for backwards compatibility ([#9004](https://github.com/MetaMask/core/pull/9004))
- Live token balance queries now respect the `confirmations_pay_extended.excludeChainIdsFromInfura` feature flag, skipping the Infura endpoint preference for excluded chains ([#8992](https://github.com/MetaMask/core/pull/8992))
- Bump `@metamask/assets-controllers` from `^108.3.0` to `^108.5.0` ([#8981](https://github.com/MetaMask/core/pull/8981), [#8999](https://github.com/MetaMask/core/pull/8999))
- Bump `@metamask/assets-controller` from `^8.0.2` to `^8.3.2` ([#8981](https://github.com/MetaMask/core/pull/8981), [#8985](https://github.com/MetaMask/core/pull/8985), [#8999](https://github.com/MetaMask/core/pull/8999))
- Bump `@metamask/remote-feature-flag-controller` from `^4.2.1` to `^4.2.2` ([#8986](https://github.com/MetaMask/core/pull/8986))
- Bump `@metamask/ramps-controller` from `^14.1.0` to `^14.1.1` ([#8989](https://github.com/MetaMask/core/pull/8989))
- Bump `@metamask/bridge-status-controller` from `^72.0.0` to `^72.0.2` ([#8990](https://github.com/MetaMask/core/pull/8990), [#8999](https://github.com/MetaMask/core/pull/8999))
- Bump `@metamask/bridge-controller` from `^73.2.0` to `^73.2.1` ([#8999](https://github.com/MetaMask/core/pull/8999))
- Bump `@metamask/transaction-controller` from `^66.0.0` to `^67.0.0` ([#8999](https://github.com/MetaMask/core/pull/8999), [#9021](https://github.com/MetaMask/core/pull/9021), [#9027](https://github.com/MetaMask/core/pull/9027))

## [23.1.0]

### Changed

- Fiat quote flow now uses `autoSelectProvider` and `restrictToKnownOrNativeProviders` instead of manually reading the selected provider from `RampsController` state ([#8963](https://github.com/MetaMask/core/pull/8963))
- Remove `RampsControllerGetStateAction` and `RampsControllerSetSelectedTokenAction` from `AllowedActions` as they are no longer used ([#8963](https://github.com/MetaMask/core/pull/8963))
- Bump `@metamask/ramps-controller` from `^14.0.0` to `^14.1.0` ([#8968](https://github.com/MetaMask/core/pull/8968))

## [23.0.0]

### Changed

- **BREAKING:** Live token balance queries now prefer the chain's Infura endpoint, falling back to the default endpoint if no Infura endpoint is configured ([#8839](https://github.com/MetaMask/core/pull/8839))
  - Clients must allow the `NetworkController:getNetworkConfigurationByChainId` action on the messenger
- Bump `@metamask/assets-controllers` from `^108.2.0` to `^108.3.0` ([#8941](https://github.com/MetaMask/core/pull/8941))
- Bump `@metamask/assets-controller` from `^8.1.0` to `^8.2.0` ([#8943](https://github.com/MetaMask/core/pull/8943))

## [22.8.0]

### Added

- Add `getPaymentOverrideData` callback to `TransactionPayControllerOptions`, when `paymentOverride` is defined on a transaction, this callback is invoked the resulting transactions are injected into the relay quote steps ([#8870](https://github.com/MetaMask/core/pull/8870))
- Add `Server` pay strategy that routes quote, submit, and status requests through the MetaMask intents API ([#8894](https://github.com/MetaMask/core/pull/8894))

### Changed

- Bump `@metamask/assets-controllers` from `^108.1.0` to `^108.2.0` ([#8911](https://github.com/MetaMask/core/pull/8911))
- Bump `@metamask/assets-controller` from `^8.0.1` to `^8.1.0` ([#8912](https://github.com/MetaMask/core/pull/8912), [#8919](https://github.com/MetaMask/core/pull/8919))
- Bump `@metamask/bridge-status-controller` from `^71.2.0` to `^72.0.0` ([#8912](https://github.com/MetaMask/core/pull/8912), [#8935](https://github.com/MetaMask/core/pull/8935))
- Bump `@metamask/bridge-controller` from `^73.0.1` to `^73.2.0` ([#8915](https://github.com/MetaMask/core/pull/8915), [#8935](https://github.com/MetaMask/core/pull/8935))

## [22.7.0]

### Added

- Add `paymentOverride` property (type `PaymentOverride`) to `TransactionConfig` and `TransactionData`, settable via `setTransactionConfig` ([#8858](https://github.com/MetaMask/core/pull/8858))

### Changed

- Bump `@metamask/assets-controller` from `^8.0.0` to `^8.0.1` ([#8874](https://github.com/MetaMask/core/pull/8874))

## [22.6.3]

### Changed

- Bump `@metamask/assets-controller` from `^7.1.2` to `^8.0.0` ([#8866](https://github.com/MetaMask/core/pull/8866))
- Bump `@metamask/bridge-controller` from `^73.0.0` to `^73.0.1` ([#8866](https://github.com/MetaMask/core/pull/8866))

## [22.6.2]

### Changed

- Bump `@metamask/ramps-controller` from `^13.3.1` to `^14.0.0` ([#8859](https://github.com/MetaMask/core/pull/8859))

## [22.6.1]

### Changed

- Bump `@metamask/bridge-controller` from `^72.0.4` to `^73.0.0` ([#8850](https://github.com/MetaMask/core/pull/8850))
- Remove unnecessary type assertions for bridge quotes ([#8805](https://github.com/MetaMask/core/pull/8805))

### Fixed

- Treat `perpsDepositAndOrder` transactions identically to `perpsDeposit` in the Relay strategy ([#8851](https://github.com/MetaMask/core/pull/8851))

## [22.6.0]

### Changed

- Pass `isInternal: true` to all internal `addTransaction` calls to adopt the explicit `isInternal` flag introduced in `@metamask/transaction-controller` ([#8633](https://github.com/MetaMask/core/pull/8633))
- Bump `@metamask/bridge-status-controller` from `^71.1.4` to `^71.2.0` ([#8848](https://github.com/MetaMask/core/pull/8848))
- Bump `@metamask/transaction-controller` from `^65.4.0` to `^66.0.0` ([#8848](https://github.com/MetaMask/core/pull/8848))
- Bump `@metamask/gas-fee-controller` from `^26.2.1` to `^26.2.2` ([#8834](https://github.com/MetaMask/core/pull/8834))

### Fixed

- Fix BigNumber crash when exchange rate numbers exceed 15 significant digits ([#8808](https://github.com/MetaMask/core/pull/8808))
- Handle gas-station and prefunded gas-estimate edge cases for Across Predict withdraw quotes ([#8762](https://github.com/MetaMask/core/pull/8762))

## [22.5.0]

### Added

- Add Across submit support for post-quote Predict withdraw flows ([#8761](https://github.com/MetaMask/core/pull/8761))
- Add Polymarket deposit-wallet support to the Relay strategy for `predictWithdraw` transactions, routed via the `isPolymarketDepositWallet` flag on `TransactionConfig` ([#8754](https://github.com/MetaMask/core/pull/8754))

### Changed

- Move the Relay gasless execution feature flag to `confirmations_pay_extended.payStrategies.relay.gaslessEnabled` ([#8810](https://github.com/MetaMask/core/pull/8810))

## [22.4.0]

### Added

- Add Across quote support for post-quote Predict withdraw flows ([#8760](https://github.com/MetaMask/core/pull/8760))

### Changed

- Derive fiat order source amount from on-chain transaction data (`order.txHash`) with fallback to `order.cryptoAmount` ([#8694](https://github.com/MetaMask/core/pull/8694))
- Persist fiat order ID and provider code on `transaction.metamaskPay` before polling, so activity views can query order status after controller state cleanup ([#8694](https://github.com/MetaMask/core/pull/8694))
- Bump `@metamask/assets-controller` from `^7.1.1` to `^7.1.2` ([#8783](https://github.com/MetaMask/core/pull/8783))
- Bump `@metamask/assets-controllers` from `^108.0.0` to `^108.1.0` ([#8783](https://github.com/MetaMask/core/pull/8783))
- Bump `@metamask/transaction-controller` from `^65.3.0` to `^65.4.0` ([#8796](https://github.com/MetaMask/core/pull/8796))

### Fixed

- For postquote payments payment token for MM Pay transaction should not be reset when accountOverride is changed. ([#8787](https://github.com/MetaMask/core/pull/8787))

## [22.3.1]

### Changed

- Bump `@metamask/assets-controller` from `^7.1.0` to `^7.1.1` ([#8774](https://github.com/MetaMask/core/pull/8774))
- Bump `@metamask/assets-controllers` from `^107.0.0` to `^108.0.0` ([#8774](https://github.com/MetaMask/core/pull/8774))
- Bump `@metamask/bridge-controller` from `^72.0.3` to `^72.0.4` ([#8774](https://github.com/MetaMask/core/pull/8774))
- Bump `@metamask/bridge-status-controller` from `^71.1.3` to `^71.1.4` ([#8774](https://github.com/MetaMask/core/pull/8774))
- Bump `@metamask/network-controller` from `^31.1.0` to `^32.0.0` ([#8774](https://github.com/MetaMask/core/pull/8774))
- Bump `@metamask/controller-utils` from `^12.0.0` to `^12.1.0` ([#8774](https://github.com/MetaMask/core/pull/8774))

## [22.3.0]

### Added

- Add `POLYGON_PUSD_ADDRESS` constant and treat Polymarket pUSD as a Polygon stablecoin in display/fiat-rate logic ([#8735](https://github.com/MetaMask/core/pull/8735))
- Add Across strategy plumbing to identify post-quote Predict withdraw requests ([#8759](https://github.com/MetaMask/core/pull/8759))

### Changed

- Bump `@metamask/network-controller` from `^31.0.0` to `^31.1.0` ([#8765](https://github.com/MetaMask/core/pull/8765))
- Bump `@metamask/assets-controller` from `^7.0.1` to `^7.1.0` ([#8773](https://github.com/MetaMask/core/pull/8773))
- Bump `@metamask/assets-controllers` from `^106.0.1` to `^107.0.0` ([#8773](https://github.com/MetaMask/core/pull/8773))
- Bump `@metamask/bridge-controller` from `^72.0.2` to `^72.0.3` ([#8773](https://github.com/MetaMask/core/pull/8773))
- Bump `@metamask/bridge-status-controller` from `^71.1.2` to `^71.1.3` ([#8773](https://github.com/MetaMask/core/pull/8773))

### Fixed

- Predict same-chain withdraw quote no longer falls back to block-gas-limit (~30M+) on swap-only Relay routes ([#8735](https://github.com/MetaMask/core/pull/8735))
  - `fromOverride = Safe proxy` is now gated on the route having a `deposit` step. Same-chain destinations route through DEX swap aggregators that reject contract callers (anti-MEV `msg.sender == tx.origin` checks etc.) — for those, the relay params' EOA `from` is used so simulation succeeds.
  - Gas-fee-token lookup still uses the Safe proxy for ALL Predict withdraws (gated on `isPredictWithdraw && refundTo`), preserving the gasless flow for users who hold pUSD in the Safe but no native POL on the EOA.
- Fix post-quote relay submission when `accountOverride` is set by replacing the prepended original transaction with a delegation transaction so the override account can submit it ([#8615](https://github.com/MetaMask/core/pull/8615))

## [22.2.0]

### Changed

- Resolve fiat asset per transaction type from `confirmations_pay_fiat` remote feature flag, falling back to hardcoded map then ETH on mainnet ([#8631](https://github.com/MetaMask/core/pull/8631))
- Bump `@metamask/assets-controller` from `^7.0.0` to `^7.0.1` ([#8755](https://github.com/MetaMask/core/pull/8755))
- Bump `@metamask/assets-controllers` from `^106.0.0` to `^106.0.1` ([#8755](https://github.com/MetaMask/core/pull/8755))
- Bump `@metamask/bridge-controller` from `^72.0.1` to `^72.0.2` ([#8755](https://github.com/MetaMask/core/pull/8755))
- Bump `@metamask/bridge-status-controller` from `^71.1.1` to `^71.1.2` ([#8755](https://github.com/MetaMask/core/pull/8755))
- Bump `@metamask/controller-utils` from `^11.20.0` to `^12.0.0` ([#8755](https://github.com/MetaMask/core/pull/8755))
- Bump `@metamask/gas-fee-controller` from `^26.2.0` to `^26.2.1` ([#8755](https://github.com/MetaMask/core/pull/8755))
- Bump `@metamask/network-controller` from `^30.1.0` to `^31.0.0` ([#8755](https://github.com/MetaMask/core/pull/8755))
- Bump `@metamask/ramps-controller` from `^13.3.0` to `^13.3.1` ([#8755](https://github.com/MetaMask/core/pull/8755))
- Bump `@metamask/remote-feature-flag-controller` from `^4.2.0` to `^4.2.1` ([#8755](https://github.com/MetaMask/core/pull/8755))
- Bump `@metamask/transaction-controller` from `^65.2.0` to `^65.3.0` ([#8755](https://github.com/MetaMask/core/pull/8755))

### Fixed

- Fix fiat strategy submit flow to extract provider code from ramps quote instead of parsing order ID, store `caipAssetId` in fiat payment state, and use target amount for totals when fiat strategy is active ([#8726](https://github.com/MetaMask/core/pull/8726))

## [22.1.0]

### Fixed

- Fix transaction with accountOverride and targeting Arbitrum USDC ([#8724](https://github.com/MetaMask/core/pull/8724))
  - Deliver the Relay-acquired token to `transaction.txParams.from` (the delegator that executes the inner delegation), not `request.from`.
  - Gate the Arbitrum-USDC → Hypercore quote rewrite on `transaction.type === TransactionType.perpsDeposit`.

## [22.0.2]

### Changed

- Bump `@metamask/assets-controller` from `^6.4.0` to `^7.0.0` ([#8738](https://github.com/MetaMask/core/pull/8738))
- Bump `@metamask/bridge-controller` from `^72.0.0` to `^72.0.1` ([#8738](https://github.com/MetaMask/core/pull/8738))

## [22.0.1]

### Changed

- Bump `@metamask/bridge-controller` from `^71.1.1` to `^72.0.0` ([#8737](https://github.com/MetaMask/core/pull/8737))

## [22.0.0]

### Changed

- **BREAKING:** Re-parse required tokens when asset state changes ([#8714](https://github.com/MetaMask/core/pull/8714))
  - Adds `AssetsControllerStateChangeEvent`, `CurrencyRateStateChange`, `TokenRatesControllerStateChangeEvent`, and `TokensControllerStateChangeEvent` to `AllowedEvents`.
  - Consumers must grant these events when creating the controller messenger.
- Bump `@metamask/gas-fee-controller` from `^26.1.1` to `^26.2.0` ([#8722](https://github.com/MetaMask/core/pull/8722))
- Bump `@metamask/transaction-controller` from `^65.1.0` to `^65.2.0` ([#8722](https://github.com/MetaMask/core/pull/8722))

### Fixed

- Fix fiat strategy never being selected by routing fiat payment method through `getStrategyOrder` and allowing quote retrieval when no crypto payment token is set ([#8720](https://github.com/MetaMask/core/pull/8720))

## [21.1.0]

### Added

- Allow EIP-7702 authorizations from accounts in the Money keyring ([#8687](https://github.com/MetaMask/core/pull/8687))
- Implement fiat strategy submit flow with order polling and relay execution ([#8347](https://github.com/MetaMask/core/pull/8347))

### Changed

- Bump `@metamask/bridge-controller` from `^71.0.0` to `^71.1.1` ([#8706](https://github.com/MetaMask/core/pull/8706), [#8721](https://github.com/MetaMask/core/pull/8721))
- Bump `@metamask/transaction-controller` from `^65.0.0` to `^65.1.0` ([#8691](https://github.com/MetaMask/core/pull/8691))
- Bump `@metamask/ramps-controller` from `^13.2.0` to `^13.3.0` ([#8698](https://github.com/MetaMask/core/pull/8698))
- Bump `@metamask/assets-controller` from `^6.3.0` to `^6.4.0` ([#8721](https://github.com/MetaMask/core/pull/8721))
- Bump `@metamask/assets-controllers` from `^105.1.0` to `^106.0.0` ([#8721](https://github.com/MetaMask/core/pull/8721))

## [21.0.0]

### Added

- Add Gas Station support for Across source transactions when native balance is insufficient ([#8588](https://github.com/MetaMask/core/pull/8588))

### Changed

- **BREAKING:** Narrow `AllowedActions` type to use individual action types instead of compound controller action unions (`BridgeControllerActions`, `BridgeStatusControllerActions`, `CurrencyRateControllerActions`, `GasFeeControllerActions`) ([#8670](https://github.com/MetaMask/core/pull/8670))

### Fixed

- Pass explicit `assetId`, `providers`, and `fiat` to `RampsController:getQuotes` and persist the selected ramps quote on `TransactionFiatPayment` ([#8628](https://github.com/MetaMask/core/pull/8628))

## [20.2.0]

### Changed

- Stop synthesising a native gas-fee required token in `parseRequiredTokens`, only token-transfer assets are returned now ([#8554](https://github.com/MetaMask/core/pull/8554))
- Add layered submission error prefixes for failure-surface attribution in error metrics ([#8656](https://github.com/MetaMask/core/pull/8656))
  - `MetaMask Pay:` wraps all errors from the Pay publish hook
  - `Relay submit:` wraps all errors from the relay strategy
  - `Relay execute:` cascades inside `Relay submit:` for `/execute` POST failures
  - Relay non-OK responses now surface as `<status> - <body message or error>` (or just `<status>`), replacing the previous URL-leaking generic fetch failure message
- Bump `@metamask/assets-controller` from `^6.2.1` to `^6.3.0` ([#8661](https://github.com/MetaMask/core/pull/8661))
- Bump `@metamask/assets-controllers` from `^105.0.0` to `^105.1.0` ([#8661](https://github.com/MetaMask/core/pull/8661))

## [20.1.0]

### Added

- Export `TransactionData` type from public API ([#8630](https://github.com/MetaMask/core/pull/8630))

### Changed

- Abort in-flight quote requests when a newer request is made for the same transaction, preventing stale responses from overwriting newer ones ([#8612](https://github.com/MetaMask/core/pull/8612))
- Bump `@metamask/messenger` from `^1.1.1` to `^1.2.0` ([#8632](https://github.com/MetaMask/core/pull/8632))
- Bump `@metamask/network-controller` from `^30.0.1` to `^30.1.0` ([#8636](https://github.com/MetaMask/core/pull/8636))

## [20.0.1]

### Changed

- Bump `@metamask/assets-controller` from `^6.2.0` to `^6.2.1` ([#8622](https://github.com/MetaMask/core/pull/8622))
- Bump `@metamask/assets-controllers` from `^104.3.0` to `^105.0.0` ([#8622](https://github.com/MetaMask/core/pull/8622))
- Bump `@metamask/bridge-controller` from `^70.2.0` to `^71.0.0` ([#8622](https://github.com/MetaMask/core/pull/8622))
- Bump `@metamask/bridge-status-controller` from `^71.0.0` to `^71.1.0` ([#8622](https://github.com/MetaMask/core/pull/8622))

## [20.0.0]

### Changed

- Rename `executeEnabled` feature flag to `gaslessEnabled` ([#8607](https://github.com/MetaMask/core/pull/8607))
- Bump `@metamask/transaction-controller` from `^64.3.0` to `^65.0.0` ([#8585](https://github.com/MetaMask/core/pull/8585), [#8613](https://github.com/MetaMask/core/pull/8613))
- Bump `@metamask/assets-controller` from `^6.1.0` to `^6.2.0` ([#8590](https://github.com/MetaMask/core/pull/8590))

### Fixed

- Fall back from Across to later pay strategies when Across quotes would require a first-time EIP-7702 authorization list ([#8577](https://github.com/MetaMask/core/pull/8577))
- **BREAKING:** Fix mUSD conversion for hardware wallets on EIP-7702 chains by gating relay and Across 7702 paths on the account keyring type via `KeyringController:getState` ([#8388](https://github.com/MetaMask/core/pull/8388))
  - The `TransactionPayControllerMessenger` now requires `KeyringController:getState` permission.

## [19.3.0]

### Added

- Add support for transaction config parameter accountOverride ([#8454](https://github.com/MetaMask/core/pull/8454))

### Changed

- Bump `@metamask/assets-controller` from `^6.0.0` to `^6.1.0` ([#8559](https://github.com/MetaMask/core/pull/8559))
- Bump `@metamask/assets-controllers` from `^104.2.0` to `^104.3.0` ([#8559](https://github.com/MetaMask/core/pull/8559))
- Bump `@metamask/bridge-controller` from `^70.1.1` to `^70.2.0` ([#8571](https://github.com/MetaMask/core/pull/8571))
- Bump `@metamask/bridge-status-controller` from `^70.0.5` to `^71.0.0` ([#8571](https://github.com/MetaMask/core/pull/8571))

## [19.2.2]

### Changed

- Bump `@metamask/assets-controllers` from `^104.0.0` to `^104.2.0` ([#8509](https://github.com/MetaMask/core/pull/8509), [#8544](https://github.com/MetaMask/core/pull/8544))

### Fixed

- Ignore synthetic gas legs when determining Across support for perps direct deposits ([#8527](https://github.com/MetaMask/core/pull/8527))
- Route Across status polling through the configured Across API base and support `depositTxnRef`/`fillTxnRef` for Across status responses ([#8512](https://github.com/MetaMask/core/pull/8512))

## [19.2.1]

### Fixed

- Resolve correct `networkClientId` for source chain in Relay execute flow ([#8492](https://github.com/MetaMask/core/pull/8492))
- Stop double-counting subsidized fees in Relay quote target amounts ([#8488](https://github.com/MetaMask/core/pull/8488))

## [19.2.0]

### Changed

- Bump `@metamask/ramps-controller` from `^13.1.0` to `^13.2.0` ([#8476](https://github.com/MetaMask/core/pull/8476))
- Bump `@metamask/transaction-controller` from `^64.2.0` to `^64.3.0` ([#8482](https://github.com/MetaMask/core/pull/8482))

## [19.1.3]

### Changed

- Bump `@metamask/assets-controller` from `^5.0.1` to `^6.0.0` ([#8474](https://github.com/MetaMask/core/pull/8474))
- Bump `@metamask/bridge-controller` from `^70.1.0` to `^70.1.1` ([#8474](https://github.com/MetaMask/core/pull/8474))

### Fixed

- Resolve the effective transaction type from `nestedTransactions` when the parent is a batch transaction ([#8469](https://github.com/MetaMask/core/pull/8469))

## [19.1.2]

### Changed

- Bump `@metamask/base-controller` from `^9.0.1` to `^9.1.0` ([#8457](https://github.com/MetaMask/core/pull/8457))
- Bump `@metamask/assets-controller` from `^5.0.0` to `^5.0.1` ([#8466](https://github.com/MetaMask/core/pull/8466))
- Bump `@metamask/assets-controllers` from `^103.1.1` to `^104.0.0` ([#8466](https://github.com/MetaMask/core/pull/8466))
- Bump `@metamask/bridge-controller` from `^70.0.1` to `^70.1.0` ([#8466](https://github.com/MetaMask/core/pull/8466))

## [19.1.1]

### Changed

- Bump `@metamask/ramps-controller` from `^13.0.0` to `^13.1.0` ([#8407](https://github.com/MetaMask/core/pull/8407))
- Bump `@metamask/transaction-controller` from `^64.0.0` to `^64.2.0` ([#8432](https://github.com/MetaMask/core/pull/8432), [#8447](https://github.com/MetaMask/core/pull/8447))

### Fixed

- Set `submittedTime` at the start of `TransactionPayPublishHook` before strategy execution for accurate `mm_pay_time_to_complete_s` metrics in intent-based flows ([#8439](https://github.com/MetaMask/core/pull/8439))

## [19.1.0]

### Added

- Support for perps deposit for Across ([#8334](https://github.com/MetaMask/core/pull/8334))

### Changed

- Bump `@metamask/assets-controller` from `^4.0.0` to `^5.0.0` ([#8406](https://github.com/MetaMask/core/pull/8406))

### Fixed

- Fix perps withdraw to Arbitrum USDC showing inflated transaction fee by bypassing same-token filter when `isHyperliquidSource` is set ([#8387](https://github.com/MetaMask/core/pull/8387))

## [19.0.3]

### Changed

- Bump `@metamask/ramps-controller` from `^12.1.0` to `^13.0.0` ([#8380](https://github.com/MetaMask/core/pull/8380))
- Bump `@metamask/messenger` from `^1.0.0` to `^1.1.1` ([#8364](https://github.com/MetaMask/core/pull/8364), [#8373](https://github.com/MetaMask/core/pull/8373))

## [19.0.2]

### Changed

- Bump `@metamask/bridge-controller` from `^70.0.0` to `^70.0.1` ([#8359](https://github.com/MetaMask/core/pull/8359))
- Bump `@metamask/bridge-status-controller` from `^70.0.4` to `^70.0.5` ([#8359](https://github.com/MetaMask/core/pull/8359))
- Bump `@metamask/transaction-controller` from `^63.3.1` to `^64.0.0` ([#8359](https://github.com/MetaMask/core/pull/8359))
- Bump `@metamask/controller-utils` from `^11.19.0` to `^11.20.0` ([#8344](https://github.com/MetaMask/core/pull/8344))
- Bump `@metamask/assets-controller` from `^3.2.1` to `^4.0.0` ([#8355](https://github.com/MetaMask/core/pull/8355), [#8359](https://github.com/MetaMask/core/pull/8359))
- Bump `@metamask/assets-controllers` from `^103.0.0` to `^103.1.1` ([#8355](https://github.com/MetaMask/core/pull/8355), [#8359](https://github.com/MetaMask/core/pull/8359))

## [19.0.1]

### Changed

- Bump `@metamask/bridge-controller` from `^69.2.3` to `^70.0.0` ([#8340](https://github.com/MetaMask/core/pull/8340))
- Bump `@metamask/bridge-status-controller` from `^70.0.3` to `^70.0.4` ([#8340](https://github.com/MetaMask/core/pull/8340))
- Add route-based `confirmations_pay` strategy resolution ([#8282](https://github.com/MetaMask/core/pull/8282))

## [19.0.0]

### Added

- **BREAKING:** Add `KeyringControllerSignTypedMessageAction` to `AllowedActions` for HyperLiquid EIP-712 signing ([#8314](https://github.com/MetaMask/core/pull/8314))
  - Clients must now provide `KeyringController:signTypedMessage` permission when constructing the controller messenger
- Add HyperLiquid withdrawal submission via Relay ([#8314](https://github.com/MetaMask/core/pull/8314))
- Add HyperLiquid source quote support for Relay strategy ([#8285](https://github.com/MetaMask/core/pull/8285))
- Bump `@metamask/assets-controller` from `^3.2.0` to `^3.2.1` ([#8325](https://github.com/MetaMask/core/pull/8325))
- Bump `@metamask/assets-controllers` from `^102.0.0` to `^103.0.0` ([#8325](https://github.com/MetaMask/core/pull/8325))
- Bump `@metamask/bridge-controller` from `^69.2.2` to `^69.2.3` ([#8325](https://github.com/MetaMask/core/pull/8325))
- Bump `@metamask/bridge-status-controller` from `^70.0.2` to `^70.0.3` ([#8325](https://github.com/MetaMask/core/pull/8325))

## [18.2.0]

### Changed

- Bump `@metamask/assets-controllers` from `^101.0.1` to `^102.0.0` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/base-controller` from `^9.0.0` to `^9.0.1` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/bridge-controller` from `^69.2.1` to `^69.2.2` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/bridge-status-controller` from `^70.0.1` to `^70.0.2` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/gas-fee-controller` from `^26.1.0` to `^26.1.1` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/messenger` from `^0.3.0` to `^1.0.0` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/network-controller` from `^30.0.0` to `^30.0.1` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/ramps-controller` from `^12.0.1` to `^12.1.0` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/remote-feature-flag-controller` from `^4.1.0` to `^4.2.0` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/assets-controller` from `^3.1.0` to `^3.2.0` ([#8298](https://github.com/MetaMask/core/pull/8298), [#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/transaction-controller` from `^63.1.0` to `^63.3.1` ([#8301](https://github.com/MetaMask/core/pull/8301), [#8313](https://github.com/MetaMask/core/pull/8313), [#8317](https://github.com/MetaMask/core/pull/8317))

## [18.1.0]

### Added

- Add `FiatStrategy` to retrieve quotes via `RampsController` ([#8121](https://github.com/MetaMask/core/pull/8121))

### Changed

- Bump `@metamask/bridge-controller` from `^69.1.1` to `^69.2.1` ([#8265](https://github.com/MetaMask/core/pull/8265), [#8288](https://github.com/MetaMask/core/pull/8288))
- Bump `@metamask/bridge-status-controller` from `^70.0.0` to `^70.0.1` ([#8288](https://github.com/MetaMask/core/pull/8288))
- Bump `@metamask/transaction-controller` from `^63.0.0` to `^63.1.0` ([#8272](https://github.com/MetaMask/core/pull/8272))
- Bump `@metamask/assets-controller` from `^3.0.0` to `^3.1.0` ([#8276](https://github.com/MetaMask/core/pull/8276))

## [18.0.0]

### Changed

- **BREAKING** Bump `@metamask/bridge-status-controller` from `^69.0.0` to `^70.0.0` ([#8252](https://github.com/MetaMask/core/pull/8252))
- Bump `@metamask/assets-controller` from `^2.4.0` to `^3.0.0` ([#8232](https://github.com/MetaMask/core/pull/8232))
- Bump `@metamask/assets-controllers` from `^101.0.0` to `^101.0.1` ([#8232](https://github.com/MetaMask/core/pull/8232))
- Remove duplication in gas estimation for Relay and Across strategies ([#8145](https://github.com/MetaMask/core/pull/8145))
- Improve Across quote handling to decode supported destination calls into post-swap actions while sending transfer-only destinations directly to the destination recipient ([#8208](https://github.com/MetaMask/core/pull/8208))

## [17.1.0]

### Added

- New public wrapper methods: `getDelegationTransaction()`, `getStrategy()` ([#8183](https://github.com/MetaMask/core/pull/8183))

### Changed

- Bump `@metamask/assets-controller` from `^2.3.0` to `^2.4.0` ([#8225](https://github.com/MetaMask/core/pull/8225))
- Bump `@metamask/assets-controllers` from `^100.2.1` to `^101.0.0` ([#8225](https://github.com/MetaMask/core/pull/8225))
- Bump `@metamask/bridge-controller` from `^69.1.0` to `^69.1.1` ([#8225](https://github.com/MetaMask/core/pull/8225))
- Bump `@metamask/bridge-status-controller` from `^68.1.0` to `^69.0.0` ([#8225](https://github.com/MetaMask/core/pull/8225))
- Bump `@metamask/gas-fee-controller` from `^26.0.3` to `^26.1.0` ([#8225](https://github.com/MetaMask/core/pull/8225))
- Bump `@metamask/transaction-controller` from `^62.22.0` to `^63.0.0` ([#8225](https://github.com/MetaMask/core/pull/8225))

## [17.0.0]

### Added

- **BREAKING:** Add `AssetsControllerGetStateForTransactionPayAction` to the `AllowedActions` messenger type ([#8163](https://github.com/MetaMask/core/pull/8163))

### Changed

- `getTokenBalance`, `getTokenInfo`, and `getTokenFiatRate` now source token metadata, balances, and pricing from `AssetsControllerGetStateForTransactionPayAction` when the `assetsUnifyState` remote feature flag is enabled, falling back to individual controller state calls otherwise ([#8163](https://github.com/MetaMask/core/pull/8163))
- Zero out source network fees in Relay strategy when quote indicates execute flow ([#8181](https://github.com/MetaMask/core/pull/8181))
- Harden relay status polling ([#8189](https://github.com/MetaMask/core/pull/8189))
  - Throw if status not recognised.
  - Support feature flags for polling interval and timeout.
  - Ignore transient network errors.
- Bump `@metamask/transaction-controller` from `^62.21.0` to `^62.22.0` ([#8217](https://github.com/MetaMask/core/pull/8217))

## [16.5.0]

### Added

- Support gasless Relay deposits via `execute` endpoint ([#8133](https://github.com/MetaMask/core/pull/8133))
- Build Across post-swap transfer actions for `predictDeposit` quotes so Predict deposits can bridge swapped output into the destination proxy wallet ([#8159](https://github.com/MetaMask/core/pull/8159))

### Changed

- Bump `@metamask/assets-controllers` from `^100.2.0` to `^100.2.1` ([#8162](https://github.com/MetaMask/core/pull/8162))
- Bump `@metamask/bridge-controller` from `^69.0.0` to `^69.1.0` ([#8162](https://github.com/MetaMask/core/pull/8162), [#8168](https://github.com/MetaMask/core/pull/8168))
- Bump `@metamask/bridge-status-controller` from `^68.0.1` to `^68.1.0` ([#8162](https://github.com/MetaMask/core/pull/8162), [#8168](https://github.com/MetaMask/core/pull/8168))

### Fixed

- Support gasless withdraw for post-quote flows (e.g. Predict Withdraw) when transaction would provide sufficient token balance for gas fee token ([#8146](https://github.com/MetaMask/core/pull/8146))

## [16.4.1]

### Changed

- Bump `@metamask/assets-controllers` from `^100.1.0` to `^100.2.0` ([#8140](https://github.com/MetaMask/core/pull/8140))
- Bump `@metamask/bridge-controller` from `^68.0.0` to `^69.0.0` ([#8140](https://github.com/MetaMask/core/pull/8140))
- Bump `@metamask/bridge-status-controller` from `^68.0.0` to `^68.0.1` ([#8140](https://github.com/MetaMask/core/pull/8140))
- Bump `@metamask/transaction-controller` from `^62.20.0` to `^62.21.0` ([#8140](https://github.com/MetaMask/core/pull/8140))

## [16.4.0]

### Added

- Add a dedicated max-amount gas-station fallback flow for Relay quoting ([#7927](https://github.com/MetaMask/core/pull/7927))
- Add Across pay strategy support ([#7886](https://github.com/MetaMask/core/pull/7886))
- Add `fiatPayment` transaction state into `transactionData` and `updateFiatPayment` callback action ([#8093](https://github.com/MetaMask/core/pull/8093))

## [16.3.0]

### Added

- Add optional `refundTo` field to `TransactionConfig`, `TransactionData`, and `QuoteRequest` types, allowing callers to specify an address that receives refunds if a Relay transaction fails ([#8112](https://github.com/MetaMask/core/pull/8112))

### Changed

- Bump `@metamask/assets-controllers` from `^100.0.3` to `^100.1.0` ([#8107](https://github.com/MetaMask/core/pull/8107))
- Bump `@metamask/transaction-controller` from `^62.19.0` to `^62.20.0` ([#8104](https://github.com/MetaMask/core/pull/8104))

## [16.2.0]

### Changed

- Bump `@metamask/bridge-controller` from `^67.4.0` to `^68.0.0` ([#8101](https://github.com/MetaMask/core/pull/8101))
- Bump `@metamask/bridge-status-controller` from `^67.0.1` to `^68.0.0` ([#8101](https://github.com/MetaMask/core/pull/8101))

## [16.1.2]

### Fixed

- Normalize Polygon native token addresses between Relay requests and MetaMask balance checks to avoid undefined token values in quote and submit flows ([#8091](https://github.com/MetaMask/core/pull/8091))

## [16.1.1]

### Changed

- Bump `@metamask/bridge-controller` from `^67.2.0` to `^67.4.0` ([#8051](https://github.com/MetaMask/core/pull/8051), [#8070](https://github.com/MetaMask/core/pull/8070))
- Bump `@metamask/remote-feature-flag-controller` from `^4.0.0` to `^4.1.0` ([#8041](https://github.com/MetaMask/core/pull/8041))

### Fixed

- Support gasless predict withdraw ([#8067](https://github.com/MetaMask/core/pull/8067))

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
- Bump `@metamask/assets-controllers` from `^99.2.0` to `^99.3.2`, ([#7855](https://github.com/MetaMask/core/pull/7855), [#7860](https://github.com/MetaMask/core/pull/7860), [#7897](https://github.com/MetaMask/core/pull/7897))
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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@25.0.0...HEAD
[25.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@24.1.0...@metamask/transaction-pay-controller@25.0.0
[24.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@24.0.3...@metamask/transaction-pay-controller@24.1.0
[24.0.3]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@24.0.2...@metamask/transaction-pay-controller@24.0.3
[24.0.2]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@24.0.1...@metamask/transaction-pay-controller@24.0.2
[24.0.1]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@24.0.0...@metamask/transaction-pay-controller@24.0.1
[24.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@23.17.4...@metamask/transaction-pay-controller@24.0.0
[23.17.4]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@23.17.3...@metamask/transaction-pay-controller@23.17.4
[23.17.3]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@23.17.2...@metamask/transaction-pay-controller@23.17.3
[23.17.2]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@23.17.1...@metamask/transaction-pay-controller@23.17.2
[23.17.1]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@23.17.0...@metamask/transaction-pay-controller@23.17.1
[23.17.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@23.16.1...@metamask/transaction-pay-controller@23.17.0
[23.16.1]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@23.16.0...@metamask/transaction-pay-controller@23.16.1
[23.16.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@23.15.0...@metamask/transaction-pay-controller@23.16.0
[23.15.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@23.14.0...@metamask/transaction-pay-controller@23.15.0
[23.14.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@23.13.1...@metamask/transaction-pay-controller@23.14.0
[23.13.1]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@23.13.0...@metamask/transaction-pay-controller@23.13.1
[23.13.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@23.12.0...@metamask/transaction-pay-controller@23.13.0
[23.12.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@23.11.0...@metamask/transaction-pay-controller@23.12.0
[23.11.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@23.10.0...@metamask/transaction-pay-controller@23.11.0
[23.10.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@23.9.0...@metamask/transaction-pay-controller@23.10.0
[23.9.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@23.8.0...@metamask/transaction-pay-controller@23.9.0
[23.8.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@23.7.0...@metamask/transaction-pay-controller@23.8.0
[23.7.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@23.6.0...@metamask/transaction-pay-controller@23.7.0
[23.6.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@23.5.1...@metamask/transaction-pay-controller@23.6.0
[23.5.1]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@23.5.0...@metamask/transaction-pay-controller@23.5.1
[23.5.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@23.4.0...@metamask/transaction-pay-controller@23.5.0
[23.4.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@23.3.1...@metamask/transaction-pay-controller@23.4.0
[23.3.1]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@23.3.0...@metamask/transaction-pay-controller@23.3.1
[23.3.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@23.2.0...@metamask/transaction-pay-controller@23.3.0
[23.2.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@23.1.0...@metamask/transaction-pay-controller@23.2.0
[23.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@23.0.0...@metamask/transaction-pay-controller@23.1.0
[23.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@22.8.0...@metamask/transaction-pay-controller@23.0.0
[22.8.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@22.7.0...@metamask/transaction-pay-controller@22.8.0
[22.7.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@22.6.3...@metamask/transaction-pay-controller@22.7.0
[22.6.3]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@22.6.2...@metamask/transaction-pay-controller@22.6.3
[22.6.2]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@22.6.1...@metamask/transaction-pay-controller@22.6.2
[22.6.1]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@22.6.0...@metamask/transaction-pay-controller@22.6.1
[22.6.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@22.5.0...@metamask/transaction-pay-controller@22.6.0
[22.5.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@22.4.0...@metamask/transaction-pay-controller@22.5.0
[22.4.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@22.3.1...@metamask/transaction-pay-controller@22.4.0
[22.3.1]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@22.3.0...@metamask/transaction-pay-controller@22.3.1
[22.3.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@22.2.0...@metamask/transaction-pay-controller@22.3.0
[22.2.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@22.1.0...@metamask/transaction-pay-controller@22.2.0
[22.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@22.0.2...@metamask/transaction-pay-controller@22.1.0
[22.0.2]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@22.0.1...@metamask/transaction-pay-controller@22.0.2
[22.0.1]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@22.0.0...@metamask/transaction-pay-controller@22.0.1
[22.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@21.1.0...@metamask/transaction-pay-controller@22.0.0
[21.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@21.0.0...@metamask/transaction-pay-controller@21.1.0
[21.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@20.2.0...@metamask/transaction-pay-controller@21.0.0
[20.2.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@20.1.0...@metamask/transaction-pay-controller@20.2.0
[20.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@20.0.1...@metamask/transaction-pay-controller@20.1.0
[20.0.1]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@20.0.0...@metamask/transaction-pay-controller@20.0.1
[20.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@19.3.0...@metamask/transaction-pay-controller@20.0.0
[19.3.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@19.2.2...@metamask/transaction-pay-controller@19.3.0
[19.2.2]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@19.2.1...@metamask/transaction-pay-controller@19.2.2
[19.2.1]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@19.2.0...@metamask/transaction-pay-controller@19.2.1
[19.2.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@19.1.3...@metamask/transaction-pay-controller@19.2.0
[19.1.3]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@19.1.2...@metamask/transaction-pay-controller@19.1.3
[19.1.2]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@19.1.1...@metamask/transaction-pay-controller@19.1.2
[19.1.1]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@19.1.0...@metamask/transaction-pay-controller@19.1.1
[19.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@19.0.3...@metamask/transaction-pay-controller@19.1.0
[19.0.3]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@19.0.2...@metamask/transaction-pay-controller@19.0.3
[19.0.2]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@19.0.1...@metamask/transaction-pay-controller@19.0.2
[19.0.1]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@19.0.0...@metamask/transaction-pay-controller@19.0.1
[19.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@18.2.0...@metamask/transaction-pay-controller@19.0.0
[18.2.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@18.1.0...@metamask/transaction-pay-controller@18.2.0
[18.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@18.0.0...@metamask/transaction-pay-controller@18.1.0
[18.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@17.1.0...@metamask/transaction-pay-controller@18.0.0
[17.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@17.0.0...@metamask/transaction-pay-controller@17.1.0
[17.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@16.5.0...@metamask/transaction-pay-controller@17.0.0
[16.5.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@16.4.1...@metamask/transaction-pay-controller@16.5.0
[16.4.1]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@16.4.0...@metamask/transaction-pay-controller@16.4.1
[16.4.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@16.3.0...@metamask/transaction-pay-controller@16.4.0
[16.3.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@16.2.0...@metamask/transaction-pay-controller@16.3.0
[16.2.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@16.1.2...@metamask/transaction-pay-controller@16.2.0
[16.1.2]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@16.1.1...@metamask/transaction-pay-controller@16.1.2
[16.1.1]: https://github.com/MetaMask/core/compare/@metamask/transaction-pay-controller@16.1.0...@metamask/transaction-pay-controller@16.1.1
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
