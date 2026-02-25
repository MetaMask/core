# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Bump `@metamask/transaction-controller` from `^62.18.0` to `^62.19.0` ([#8031](https://github.com/MetaMask/core/pull/8031))
- Bump `@metamask/assets-controllers` from `^100.0.2` to `^100.0.3` ([#8029](https://github.com/MetaMask/core/pull/8029))
- Extend quote intent validation to accept optional EIP-712 `typedData` payloads ([#7895](https://github.com/MetaMask/core/pull/7895)).

## [67.2.0]

### Changed

- Bump `@metamask/transaction-controller` from `^62.17.1` to `^62.18.0` ([#8005](https://github.com/MetaMask/core/pull/8005))
- Bump `@metamask/assets-controllers` from `^100.0.1` to `^100.0.2` ([#8004](https://github.com/MetaMask/core/pull/8004))
- Replace `PERCENT_90` with `PERCENT_75` in `InputAmountPreset` enum ([#7997](https://github.com/MetaMask/core/pull/7997))
- Add `PERCENT_90` in `InputAmountPreset` enum ([#8008](https://github.com/MetaMask/core/pull/8008))

## [67.1.1]

### Changed

- Bump `@metamask/accounts-controller` from `^36.0.0` to `^36.0.1` ([#7996](https://github.com/MetaMask/core/pull/7996))
- Bump `@metamask/assets-controllers` from `^100.0.0` to `^100.0.1` ([#7996](https://github.com/MetaMask/core/pull/7996))
- Bump `@metamask/gas-fee-controller` from `^26.0.2` to `^26.0.3` ([#7996](https://github.com/MetaMask/core/pull/7996))
- Bump `@metamask/multichain-network-controller` from `^3.0.3` to `^3.0.4` ([#7996](https://github.com/MetaMask/core/pull/7996))
- Bump `@metamask/network-controller` from `^29.0.0` to `^30.0.0` ([#7996](https://github.com/MetaMask/core/pull/7996))
- Bump `@metamask/polling-controller` from `^16.0.2` to `^16.0.3` ([#7996](https://github.com/MetaMask/core/pull/7996))
- Bump `@metamask/transaction-controller` from `^62.17.0` to `^62.17.1` ([#7996](https://github.com/MetaMask/core/pull/7996))

## [67.1.0]

### Added

- Added optional `input_amount_preset` property to the `InputChanged` event in `RequiredEventContextFromClient` ([#7987](https://github.com/MetaMask/core/pull/7987))

### Changed

- Bump `@metamask/assets-controllers` from `^99.4.0` to `^100.0.0` ([#7995](https://github.com/MetaMask/core/pull/7995))
- Bump `@metamask/controller-utils` from `^11.18.0` to `^11.19.0` ([#7995](https://github.com/MetaMask/core/pull/7995))

## [67.0.0]

### Added

- **BREAKING:** Retrieve JWT token from the ProfileSyncController and include it in bridge request headers ([#7955](https://github.com/MetaMask/core/pull/7955))

## [66.2.0]

### Added

- Added `TrendingExplore` value to `MetaMetricsSwapsEventSource` enum for attributing swaps to the trending explore flow ([#7931](https://github.com/MetaMask/core/pull/7931))
- Added `location` as a required property on all Unified SwapBridge events in `RequiredEventContextFromClient` ([#7931](https://github.com/MetaMask/core/pull/7931))
- Added `setLocation()` method to `BridgeController` for clients to set the entry point when the flow starts ([#7931](https://github.com/MetaMask/core/pull/7931))
- Exported `MetaMetricsSwapsEventSource` from the package index ([#7931](https://github.com/MetaMask/core/pull/7931))

### Changed

- Updated `#getEventProperties` to fall back to stored `#location` when `location` is not provided by the client ([#7931](https://github.com/MetaMask/core/pull/7931))
- Replaced `@deprecated` tag on `MetaMetricsSwapsEventSource` with proper JSDoc description ([#7931](https://github.com/MetaMask/core/pull/7931))
- Bump `@metamask/assets-controllers` from `^99.3.2` to `^99.4.0` ([#7944](https://github.com/MetaMask/core/pull/7944))

### Fixed

- Fix `usd_amount_source`, `usd_quoted_gas`, and `usd_quoted_return` metrics fields being empty for non-EVM chains by deriving USD exchange rates from multichain asset rates ([#7899](https://github.com/MetaMask/core/pull/7899))

## [66.1.1]

### Fixed

- Return 0-prefixed hex string from `formatChainIdToHex` utility ([#7909](https://github.com/MetaMask/core/pull/7909))

## [66.1.0] [DEPRECATED]

### Added

- Add support for Tron assets in the `formatAddressToAssetId` utility ([#7896](https://github.com/MetaMask/core/pull/7896))

### Changed

- Refresh asset exchange rates each time quotes are fetched ([#7896](https://github.com/MetaMask/core/pull/7896))
- Return checksummed EVM assetIds from the `formatAddressToAssetId` utility ([#7896](https://github.com/MetaMask/core/pull/7896))
- Bump `@metamask/keyring-api` from `^21.0.0` to `^21.5.0` ([#7857](https://github.com/MetaMask/core/pull/7857))
- Bump `@metamask/transaction-controller` from `^62.15.0` to `^62.17.0` ([#7872](https://github.com/MetaMask/core/pull/7872)), ([#7897](https://github.com/MetaMask/core/pull/7897))
- Bump `@metamask/multichain-network-controller` from `^3.0.2` to `^3.0.3` ([#7897](https://github.com/MetaMask/core/pull/7897))
- Bump `@metamask/assets-controllers` from `^99.3.1` to `^99.3.2` ([#7897](https://github.com/MetaMask/core/pull/7897))
- Bump `@metamask/accounts-controller` from `^35.0.2` to `^36.0.0` ([#7897](https://github.com/MetaMask/core/pull/7897))

### Fixed

- Fall back to the quoted `priceImpact` or `destTokenAmount` to sort quotes if the `cost` is not available ([#7896](https://github.com/MetaMask/core/pull/7896))

## [66.0.0]

### Changed

- Bump `@metamask/transaction-controller` from `^62.14.0` to `^62.15.0` ([#7854](https://github.com/MetaMask/core/pull/7854))
- Bump `@metamask/assets-controllers` from `^99.2.0` to `^99.3.1` ([#7855](https://github.com/MetaMask/core/pull/7855), [#7860](https://github.com/MetaMask/core/pull/7860))

## [65.3.0] [DEPRECATED]

### Added

- Add `MEGAETH` network support ([#7823](https://github.com/MetaMask/core/pull/7823))
  - Add `MEGAETH` into constants `ALLOWED_BRIDGE_CHAIN_IDS`, `DEFAULT_CHAIN_RANKING`, `CHAIN_IDS`, `CURRENCY_SYMBOLS` and `SWAPS_CHAINID_DEFAULT_TOKEN_MAP`
- Export `isTronChainId` from the package entrypoint ([#7697](https://github.com/MetaMask/core/pull/7697))

### Changed

- **BREAKING** Use `gasEstimatesByChainId` instead of `gasEstimates` to remove reference to the global selected network. Clients need to replace gasEstimates with the `gasEstimatesByChainId` state from the GasFeeController when using the `selectBridgeQuotes` selector ([#7826](https://github.com/MetaMask/core/pull/7826))
- Bump `@metamask/transaction-controller` from `^62.13.0` to `^62.14.0` ([#7832](https://github.com/MetaMask/core/pull/7832))

## [65.2.0]

### Added

- Add `HYPEREVM` network support ([#7787](https://github.com/MetaMask/core/pull/7787))
  - Add `HYPEREVM` into constants `ALLOWED_BRIDGE_CHAIN_IDS`, `SWAPS_TOKEN_OBJECT` and `NETWORK_TO_NAME_MAP`
- Add `PollingStatusUpdated` to `UnifiedSwapBridgeEventName` enum and `PollingStatus` enum with `MaxPollingReached` and `ManuallyRestarted` values ([#7825](https://github.com/MetaMask/core/pull/7825))

### Changed

- Bump `@metamask/transaction-controller` from `^62.11.0` to `^62.13.0` ([#7775](https://github.com/MetaMask/core/pull/7775), [#7802](https://github.com/MetaMask/core/pull/7802))
- Bump `@metamask/assets-controllers` from `^99.0.0` to `^99.2.0` ([#7771](https://github.com/MetaMask/core/pull/7771), [#7802](https://github.com/MetaMask/core/pull/7802))

## [65.1.0]

### Added

- Restore `getMinimumBalanceForRentExemptionInLamports`, `getMinimumBalanceForRentExemptionRequest`, `selectMinimumBalanceForRentExemptionInSOL`, and `minimumBalanceForRentExemptionInLamports` to state ([#7742](https://github.com/MetaMask/core/pull/7742))

### Changed

- Bump `@metamask/transaction-controller` from `^62.10.0` to `^62.11.0` ([#7760](https://github.com/MetaMask/core/pull/7760))

## [65.0.1]

### Changed

- Bump `@metamask/assets-controllers` from `^98.0.0` to `^99.0.0` ([#7751](https://github.com/MetaMask/core/pull/7751))
- Bump `@metamask/transaction-controller` from `^62.9.2` to `^62.10.0` ([#7737](https://github.com/MetaMask/core/pull/7737))

## [65.0.0]

### Changed

- Bump `@metamask/assets-controllers` from `^97.0.0` to `^98.0.0` ([#7731](https://github.com/MetaMask/core/pull/7731))
- Corrects the previous 64.8.2 release to document breaking changes that were missed:
  - **BREAKING:** Remove `getMinimumBalanceForRentExemptionInLamports`, `getMinimumBalanceForRentExemptionRequest`, `selectMinimumBalanceForRentExemptionInSOL`, and `minimumBalanceForRentExemptionInLamports` from state ([#7715](https://github.com/MetaMask/core/pull/7715))

## [64.8.2] [DEPRECATED]

### Changed

- Bump `@metamask/assets-controllers` from `^96.0.0` to `^97.0.0` ([#7722](https://github.com/MetaMask/core/pull/7722))

## [64.8.1]

### Changed

- Bump `@metamask/assets-controllers` from `^95.3.0` to `^96.0.0` ([#7704](https://github.com/MetaMask/core/pull/7704))

## [64.8.0]

### Changed

- Added check to return default values if chainRanking is empty ([#7698](https://github.com/MetaMask/core/pull/7698))

## [64.7.0]

### Changed

- Made chainRanking an optional flag ([#7691](https://github.com/MetaMask/core/pull/7691))

## [64.6.1]

### Fixed

- Fixed a typo in polling abort naming ([#7669](https://github.com/MetaMask/core/pull/7669))

## [64.6.0]

### Added

- Added chainRanking type to feature flags ([#6933](https://github.com/MetaMask/core/pull/6933))

## [64.5.1]

### Changed

- Bump `@metamask/accounts-controller` from `^35.0.1` to `^35.0.2` ([#7642](https://github.com/MetaMask/core/pull/7642))
- Bump `@metamask/assets-controllers` from `^95.2.0` to `^95.3.0` ([#7642](https://github.com/MetaMask/core/pull/7642))
- Bump `@metamask/gas-fee-controller` from `^26.0.1` to `^26.0.2` ([#7642](https://github.com/MetaMask/core/pull/7642))
- Bump `@metamask/multichain-network-controller` from `^3.0.1` to `^3.0.2` ([#7642](https://github.com/MetaMask/core/pull/7642))
- Bump `@metamask/network-controller` from `^28.0.0` to `^29.0.0` ([#7642](https://github.com/MetaMask/core/pull/7642))
- Bump `@metamask/polling-controller` from `^16.0.1` to `^16.0.2` ([#7642](https://github.com/MetaMask/core/pull/7642))
- Bump `@metamask/transaction-controller` from `^62.9.1` to `^62.9.2` ([#7642](https://github.com/MetaMask/core/pull/7642))

## [64.5.0]

### Added

- Add `has_gas_included_quote` property to `QuoteFetchData` type and compute it in `QuotesReceived` event to indicate if any received quote has gas included ([#7611](https://github.com/MetaMask/core/pull/7611))
- Add optional `usd_balance_source` property to `QuotesReceived` event and `getQuotesReceivedProperties` utility to allow clients to pass the source token balance in USD ([#7611](https://github.com/MetaMask/core/pull/7611))

### Changed

- Bump `@metamask/assets-controllers` from `^95.1.0` to `^95.2.0` ([#7622](https://github.com/MetaMask/core/pull/7622))

## [64.4.1]

### Changed

- Bump `@metamask/transaction-controller` from `^62.8.0` to `^62.9.1` ([#7602](https://github.com/MetaMask/core/pull/7602), [#7604](https://github.com/MetaMask/core/pull/7604))
- Bump `@metamask/assets-controllers` from `^95.0.0` to `^95.1.0` ([#7600](https://github.com/MetaMask/core/pull/7600))
- Bump `@metamask/network-controller` from `^27.2.0` to `^28.0.0` ([#7604](https://github.com/MetaMask/core/pull/7604))
- Bump `@metamask/accounts-controller` from `^35.0.0` to `^35.0.1` ([#7604](https://github.com/MetaMask/core/pull/7604))
- Bump `@metamask/gas-fee-controller` from `^26.0.0` to `^26.0.1` ([#7604](https://github.com/MetaMask/core/pull/7604))
- Bump `@metamask/multichain-network-controller` from `^3.0.0` to `^3.0.1` ([#7604](https://github.com/MetaMask/core/pull/7604))

## [64.4.0]

### Added

- Add intent based transaction support ([#6547](https://github.com/MetaMask/core/pull/6547))

### Changed

- Bump `@metamask/transaction-controller` from `^62.7.0` to `^62.8.0` ([#7596](https://github.com/MetaMask/core/pull/7596))
- Bump `@metamask/controller-utils` from `^11.17.0` to `^11.18.0` ([#7583](https://github.com/MetaMask/core/pull/7583))
- Bump `@metamask/network-controller` from `^27.1.0` to `^27.2.0` ([#7583](https://github.com/MetaMask/core/pull/7583))
- Bump `@metamask/assets-controllers` from `^94.0.0` to `^95.0.0` ([#7584](https://github.com/MetaMask/core/pull/7584))

## [64.3.0]

### Changed

- Bump `@metamask/snaps-controllers` from `^14.0.0` to `^17.2.0` ([#7550](https://github.com/MetaMask/core/pull/7550))
- Bump `@metamask/remote-feature-flag-controller` from `^3.1.0` to `^4.0.0` ([#7546](https://github.com/MetaMask/core/pull/7546))
- Upgrade `@metamask/utils` from `^11.8.1` to `^11.9.0` ([#7511](https://github.com/MetaMask/core/pull/7511))
- Bump `@metamask/network-controller` from `^27.0.0` to `^27.1.0` ([#7534](https://github.com/MetaMask/core/pull/7534))
- Bump `@metamask/controller-utils` from `^11.16.0` to `^11.17.0` ([#7534](https://github.com/MetaMask/core/pull/7534))

### Fixed

- Change fee_limit param naming to feeLimit for Tron ([#7571](https://github.com/MetaMask/core/pull/7571))

## [64.2.0]

### Changed

- Bump `@metamask/assets-controllers` from `^93.1.0` to `^94.1.0` ([#7444](https://github.com/MetaMask/core/pull/7444), [#7488](https://github.com/MetaMask/core/pull/7488))
- Bump `@metamask/transaction-controller` from `^62.5.0` to `^62.7.0` ([#7430](https://github.com/MetaMask/core/pull/7430), [#7494](https://github.com/MetaMask/core/pull/7494))
- Bump `@metamask/remote-feature-flag-controller` from `^3.0.0` to `^3.1.0` ([#7519](https://github.com/MetaMask/core/pull/7519))
- Add fee limit passthrough for Tron snap fee computation ([#7426](https://github.com/MetaMask/core/pull/7426))

## [64.1.0]

### Changed

- Bump `@metamask/assets-controllers` from `^93.0.0` to `^93.1.0` ([#7309](https://github.com/MetaMask/core/pull/7309))
- Bump `@metamask/remote-feature-flag-controller` from `^2.0.1` to `^3.0.0` ([#7309](https://github.com/MetaMask/core/pull/7309))
- Bump `@metamask/transaction-controller` from `^62.4.0` to `^62.5.0` ([#7325](https://github.com/MetaMask/core/pull/7325))

### Fixed

- Update gas calculation logic to use the priority fee provided by the gas-api and stop adding the base fee ([#7403](https://github.com/MetaMask/core/pull/7403), [#7406](https://github.com/MetaMask/core/pull/7406))

## [64.0.0]

### Added

- Port `fetchTokens` and `type SwapsToken` from `@metamask/swaps-controller` and export them to allow deprecating `swaps-controller` while still supporting downstream consumers ([#7278](https://github.com/MetaMask/core/pull/7278))
- Handle edge case in which approvals fail if an EVM account has an insufficient non-zero USDT allowance on mainnet ([#7228](https://github.com/MetaMask/core/pull/7228))
  - Set quoteRequest `resetApproval` parameter by calculating the wallet's USDT allowance on mainnet for the swap or bridge spender
  - When a valid quote is received, append the `resetApproval` trade data to set the wallet's USDT allowance to `0`
  - Include the `resetApproval` tx in network fee calculations

### Changed

- **BREAKING:** Remove `SWAPS_TESTNET_CHAIN_ID` export and use `CHAIN_IDS.LOCALHOST` instead ([#7278](https://github.com/MetaMask/core/pull/7278))
- Bump `@metamask/network-controller` from `^26.0.0` to `^27.0.0` ([#7258](https://github.com/MetaMask/core/pull/7258))
- Bump `@metamask/transaction-controller` from `^62.3.0` to `^62.4.0` ([#7257](https://github.com/MetaMask/core/pull/7257), [#7289](https://github.com/MetaMask/core/pull/7289))
- Bump `@metamask/assets-controllers` from `^92.0.0` to `^93.0.0` ([#7291](https://github.com/MetaMask/core/pull/7291))

### Removed

- **BREAKING** Remove public `getBridgeERC20Allowance` action to prevent consumers from using it. This handler is only applicable to Swap and Bridge txs involving USDT on mainnet ([#7228](https://github.com/MetaMask/core/pull/7228))

### Fixed

- **BREAKING:** Add `usd_amount_source` to QuotesRequested event properties. Clients will need to add this value to the quoteRequest context ([#7294](https://github.com/MetaMask/core/pull/7294))
- Add missing MON (Monad) and SEI (Sei) to integer chain IDs ([#7252](https://github.com/MetaMask/core/pull/7252))

## [63.2.0]

### Changed

- Update `stopPollingForQuotes` to accept metrics context for the QuotesReceived event. If context is provided and quotes are still loading when the handler is called, the `Unified SwapBridge Quotes Received` is published before the poll is cancelled ([#7242](https://github.com/MetaMask/core/pull/7242))

## [63.1.0]

### Added

- Port the following constants from `SwapsController` and export them: `SWAPS_TESTNET_CHAIN_ID`, `SWAPS_CONTRACT_ADDRESSES`, `SWAPS_WRAPPED_TOKENS_ADDRESSES`, `ALLOWED_CONTRACT_ADDRESSES` ([#7233](https://github.com/MetaMask/core/pull/7233))
- Port the following utils from `SwapsController` and export them: `isValidSwapsContractAddress`, `getSwapsContractAddress` ([#7233](https://github.com/MetaMask/core/pull/7233))

### Changed

- Move peer dependencies for controller and service packages to direct dependencies ([#7209](https://github.com/MetaMask/core/pull/7209), [#7220](https://github.com/MetaMask/core/pull/7220), [#7236](https://github.com/MetaMask/core/pull/7236))
  - The dependencies moved are:
    - `@metamask/accounts-controller` (^35.0.0)
    - `@metamask/assets-controllers` (^91.0.0)
    - `@metamask/network-controller` (^26.0.0)
    - `@metamask/remote-feature-flag-controller` (^2.0.1)
    - `@metamask/snaps-controllers` (^14.0.0)
    - `@metamask/transaction-controller` (^62.3.0)
  - In clients, it is now possible for multiple versions of these packages to exist in the dependency tree.
    - For example, this scenario would be valid: a client relies on `@metamask/controller-a` 1.0.0 and `@metamask/controller-b` 1.0.0, and `@metamask/controller-b` depends on `@metamask/controller-a` 1.1.0.
  - Note, however, that the versions specified in the client's `package.json` always "win", and you are expected to keep them up to date so as not to break controller and service intercommunication.

### Fixed

- Update `quotesLoadingStatus` to "LOADING" if a balance fetch is needed before fetching quotes ((https://github.com/MetaMask/core/pull/7227)[#7227])
- Wait for async SSE message handlers before updating `quotesLoadingStatus` to prevent clients from displaying "No quotes" warnings ((https://github.com/MetaMask/core/pull/7227)[#7227])

## [63.0.0]

### Changed

- **BREAKING:** Bump `@metamask/assets-controllers` from `^90.0.0` to `^91.0.0` ([#7207](https://github.com/MetaMask/core/pull/7207))

## [62.0.0]

### Added

- Add and export `getQuotesReceivedProperties` utility to build the metrics payload for clients ([#7182](https://github.com/MetaMask/core/pull/7182))

### Changed

- Bump `@metamask/polling-controller` from `^15.0.0` to `^16.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- Bump `@metamask/multichain-network-controller` from `^2.0.0` to `^3.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- Bump `@metamask/gas-fee-controller` from `^25.0.0` to `^26.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- Bump `@metamask/controller-utils` from `^11.15.0` to `^11.16.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- **BREAKING:** Bump `@metamask/transaction-controller` from `^61.0.0` to `^62.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- **BREAKING:** Bump `@metamask/network-controller` from `^25.0.0` to `^26.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- **BREAKING:** Bump `@metamask/assets-controllers` from `^89.0.0` to `^90.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- **BREAKING:** Bump `@metamask/accounts-controller` from `^34.0.0` to `^35.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))

## [61.0.0]

### Changed

- **BREAKING:** Bump `@metamask/assets-controller` from `^88.0.0` to `^89.0.0` ([#7179](https://github.com/MetaMask/core/pull/7179))

## [60.1.0]

### Added

- Added support for bridging and swapping tokens on the Tron blockchain ([#6862](https://github.com/MetaMask/core/pull/6862))

## [60.0.0]

### Changed

- **BREAKING:** Bump `@metamask/assets-controller` from `^87.0.0` to `^88.0.0` ([#7100](https://github.com/MetaMask/core/pull/7100))

## [59.0.0]

### Added

- Quotes as returned by `fetchQuotes` now include a `gasSponsored` property ([#6687](https://github.com/MetaMask/core/pull/6687))

### Changed

- **BREAKING:** Bump `@metamask/assets-controller` from `^86.0.0` to `^87.0.0` ([#7043](https://github.com/MetaMask/core/pull/7043))

## [58.0.0]

### Changed

- **BREAKING:** Bump `@metamask/assets-controller` from `^85.0.0` to `^86.0.0` ([#7011](https://github.com/MetaMask/core/pull/7011))
- **BREAKING:** `noFee` flag was replaced with `fee` flag in bridge api requests ([#6964](https://github.com/MetaMask/core/pull/6964))

## [57.0.0]

### Changed

- **BREAKING:** Bump `@metamask/assets-controller` from `^84.0.0` to `^85.0.0` ([#7003](https://github.com/MetaMask/core/pull/7003))

## [56.0.3]

### Fixed

- Removes all selectedNetworkClientId usages by finding network clients via srcChainId ([#6996](https://github.com/MetaMask/core/pull/6996))

## [56.0.2]

### Fixed

- Remove global selected network reference in `getBridgeERC20Allowance` handler ([#6994](https://github.com/MetaMask/core/pull/6994))

## [56.0.1]

### Changed

- Clean up SSE stream reader after use ([#6965](https://github.com/MetaMask/core/pull/6965))

### Fixed

- Fix Bitcoin network fee computation by extracting `unsignedPsbtBase64` from Bitcoin trade objects and supporting `'priority'` fee type from Bitcoin snap ([#6932](https://github.com/MetaMask/core/pull/6932))

## [56.0.0]

### Added

- Add `BridgeControllerGetStateAction` and `BridgeControllerStateChangeEvent` types ([#6444](https://github.com/MetaMask/core/pull/6444))

### Changed

- **BREAKING:** Use new `Messenger` from `@metamask/messenger` ([#6444](https://github.com/MetaMask/core/pull/6444))
  - Previously, `BridgeController` accepted a `RestrictedMessenger` instance from `@metamask/base-controller`.
- **BREAKING:** Metadata property `anonymous` renamed to `includeInDebugSnapshot` ([#6444](https://github.com/MetaMask/core/pull/6444))
- **BREAKING:** Bump `@metamask/accounts-controller` from `^33.0.0` to `^34.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))
- **BREAKING:** Bump `@metamask/network-controller` from `^24.0.0` to `^25.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))
- **BREAKING:** Bump `@metamask/assets-controller` from `^83.0.0` to `^84.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))
- **BREAKING:** Bump `@metamask/remote-feature-flag-controller` from `^1.6.0` to `^2.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))
- **BREAKING:** Bump `@metamask/transaction-controller` from `^60.0.0` to `^61.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))
- Bump `@metamask/base-controller` from `^8.4.2` to `^9.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))
- Bump `@metamask/gas-fee-controller` from `^24.1.0` to `^25.0.0` ([#6940](https://github.com/MetaMask/core/pull/6940), [#6962](https://github.com/MetaMask/core/pull/6962))
- Bump `@metamask/multichain-network-controller` from `^1.0.1` to `^2.0.0` ([#6940](https://github.com/MetaMask/core/pull/6940), [#6962](https://github.com/MetaMask/core/pull/6962))
- Bump `@metamask/polling-controller` from `^14.0.1` to `^15.0.0` ([#6940](https://github.com/MetaMask/core/pull/6940), [#6962](https://github.com/MetaMask/core/pull/6962))

## [55.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/assets-controllers` from `^82.0.0` to `^83.0.0` ([#6923](https://github.com/MetaMask/core/pull/6923))
- Bump `@metamask/base-controller` from `^8.4.1` to `^8.4.2` ([#6917](https://github.com/MetaMask/core/pull/6917))

## [54.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/assets-controllers` from `^81.0.0` to `^82.0.0` ([#6908](https://github.com/MetaMask/core/pull/6908))

## [53.1.0]

### Added

- Add `MONAD` network support ([#6828](https://github.com/MetaMask/core/pull/6828))
  - Add `MONAD` into constants `ALLOWED_BRIDGE_CHAIN_IDS`, `SWAPS_TOKEN_OBJECT` and `NETWORK_TO_NAME_MAP`
- Implement `fetchServerEvents` util that parses server events and parses them into JSON ([#6892](https://github.com/MetaMask/core/pull/6892))

### Changed

- **BREAKING:** Add BitcoinTradeData to QuoteResponse validation ([#6892](https://github.com/MetaMask/core/pull/6892))
- Replace `fetchEventSource` with `fetchServerEvents` ([#6892](https://github.com/MetaMask/core/pull/6892))

### Removed

- Removed dependency on `@microsoft/fetch-event-source` at `^2.0.1` ([#6892](https://github.com/MetaMask/core/pull/6892))

## [53.0.0]

### Changed

- **BREAKING:** Require clientVersion in BridgeController constructor ([#6891](https://github.com/MetaMask/core/pull/6891))
- Update the `sseEnabled` LD flag to include minimumVersion, which is used to determine whether to enable SSE ([#6891](https://github.com/MetaMask/core/pull/6891))
- Bump `@metamask/network-controller` from `^24.2.2` to `^24.3.0` ([#6883](https://github.com/MetaMask/core/pull/6883))
- Bump `@metamask/transaction-controller` from `^60.7.0` to `^60.8.0` ([#6883](https://github.com/MetaMask/core/pull/6883))

## [52.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/assets-controllers` from `^80.0.0` to `^81.0.0` ([#6834](https://github.com/MetaMask/core/pull/6834))

## [51.0.0]

### Added

- Introduce server‑sent events quote streaming and integrates incremental quote updates into the bridge controller polling flow ([#6760](https://github.com/MetaMask/core/pull/6760))
  - Add private `handleQuoteStreaming` method that calls `getQuoteStream` when the `sseEnabled` flag is enabled in LaunchDarkly
  - Reuse existing polling, metrics and validation utilities when processing server-sent quotes
- Add dependency on `@microsoft/fetch-event-source` at `^2.0.1` ([#6760](https://github.com/MetaMask/core/pull/6760))
  - Note that clients need to patch this library such that it rejects instead of resolving when the quote request is cancelled. This preserves the controller's expected request cancellation behavior

### Changed

- Extract some logic from bridge-controller and move them to utility files for better readability ([#6760](https://github.com/MetaMask/core/pull/6760))

### Removed

- Remove cache options from spot-prices and getQuote api calls since they are only required by the extension client ([#6760](https://github.com/MetaMask/core/pull/6760))

### Fixed

- Pass abortSignal to fetchAssetPricesForCurrency in order to cancel exchange rate fetching when quote parameters change ([#6760](https://github.com/MetaMask/core/pull/6760))

## [50.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/assets-controllers` from `^79.0.0` to `^80.0.0` ([#6818](https://github.com/MetaMask/core/pull/6818))

## [49.0.1]

### Changed

- Bump `@metamask/base-controller` from `^8.4.0` to `^8.4.1` ([#6807](https://github.com/MetaMask/core/pull/6807))
- Bump `@metamask/controller-utils` from `^11.14.0` to `^11.14.1` ([#6807](https://github.com/MetaMask/core/pull/6807))
- Bump `@metamask/gas-fee-controller` from `^24.0.0` to `^24.1.0` ([#6807](https://github.com/MetaMask/core/pull/6807))
- Bump `@metamask/multichain-network-controller` from `^1.0.0` to `^1.0.1` ([#6807](https://github.com/MetaMask/core/pull/6807))
- Bump `@metamask/polling-controller` from `^14.0.0` to `^14.0.1` ([#6807](https://github.com/MetaMask/core/pull/6807))

## [49.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/assets-controllers` from `^78.0.0` to `^79.0.0` ([#6806](https://github.com/MetaMask/core/pull/6806))
- Add optional `Client-Version` header to bridge API requests ([#6791](https://github.com/MetaMask/core/pull/6791))

## [48.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/assets-controllers` from `^77.0.0` to `^78.0.0` ([#6780](https://github.com/MetaMask/core/pull/6780))

## [47.2.0]

### Added

- Append quote's `featureId` to QuoteResponse object, if defined. Swap and bridge quotes have an `undefined` featureId value for backwards compatibility with old history entries ([#6739](https://github.com/MetaMask/core/pull/6739))

## [47.1.0]

### Added

- Add `bip44DefaultPairs` and `chains[chainId].defaultPairs` to feature flag types and validators ([#6645](https://github.com/MetaMask/core/pull/6645))

### Changed

- Bump `@metamask/assets-controllers` from `77.0.0` to `77.0.1` ([#6747](https://github.com/MetaMask/core/pull/6747))
- Bump `@metamask/transaction-controller` from `60.4.0` to `60.5.0` ([#6733](https://github.com/MetaMask/core/pull/6733))

## [47.0.0]

### Changed

- **BREAKING** Make `walletAddress` a required quote request parameter when calling the `updateBridgeQuoteRequestParams` handler ([#6719](https://github.com/MetaMask/core/pull/6719))
- Bump `@metamask/utils` from `^11.8.0` to `^11.8.1` ([#6708](https://github.com/MetaMask/core/pull/6708))

### Removed

- Deprecate the unused `SnapConfirmationViewed` event ([#6719](https://github.com/MetaMask/core/pull/6719))

### Fixed

- Replace `AccountsController:getSelectedMultichainAccount` usages with AccountsController:getAccountByAddress` when retrieving Solana account details for quote metadata ([#6719](https://github.com/MetaMask/core/pull/6719))

## [46.0.0]

### Added

- Add support for Bitcoin bridge transactions ([#6705](https://github.com/MetaMask/core/pull/6705))
  - Handle Bitcoin PSBT (Partially Signed Bitcoin Transaction) format in trade data
  - Support Bitcoin chain ID (`ChainId.BTC = 20000000000001`) and CAIP format (`bip122:000000000019d6689c085ae165831e93`)
- Export `isNonEvmChainId` utility function to check for non-EVM chains (Solana, Bitcoin) ([#6705](https://github.com/MetaMask/core/pull/6705))

### Changed

- **BREAKING:** Rename fee handling for non-EVM chains ([#6705](https://github.com/MetaMask/core/pull/6705))
  - Replace `SolanaFees` type with `NonEvmFees` type (exported type)
  - Replace `solanaFeesInLamports` property in quote responses with `nonEvmFeesInNative` property
  - The `nonEvmFeesInNative` property stores fees in the native units for each chain (SOL for Solana, BTC for Bitcoin)
- **BREAKING:** Update Snap methods to use new unified interface for non-EVM chains ([#6705](https://github.com/MetaMask/core/pull/6705))
  - Snaps must now implement `computeFee` method instead of `getFeeForTransaction` for fee calculation
  - The `computeFee` method returns fees in native token units rather than smallest units

## [45.0.0]

### Changed

- Bump `@metamask/assets-controllers` from `^76.0.0` to `^77.0.0` ([#6716](https://github.com/MetaMask/core/pull/6716), [#6629](https://github.com/MetaMask/core/pull/6716))

## [44.0.1]

### Changed

- Revert accidental breaking changes included in v44.0.0 ([#6454](https://github.com/MetaMask/core/pull/6454))

## [44.0.0] [DEPRECATED]

### Changed

- This version was deprecated because it accidentally included additional breaking changes; use v44.0.1 or later versions instead
- **BREAKING:** Bump peer dependency `@metamask/assets-controllers` from `^75.0.0` to `^76.0.0` ([#6676](https://github.com/MetaMask/core/pull/6676))

## [43.2.1]

### Added

- Add Solana Devnet support to bridge controller ([#6670](https://github.com/MetaMask/core/pull/6670))

## [43.2.0]

### Added

- Add optional `noFeeAssets` property to the `ChainConfigurationSchema` type ([#6665](https://github.com/MetaMask/core/pull/6665))

## [43.1.0]

### Added

- Add `selectDefaultSlippagePercentage` that returns the default slippage for a chain and token combination ([#6616](https://github.com/MetaMask/core/pull/6616))
  - Return `0.5` if requesting a bridge quote
  - Return `undefined` (auto) if requesting a Solana swap
  - Return `0.5` if both tokens are stablecoins (based on dynamic `stablecoins` list from LD chain config)
  - Return `2` for all other EVM swaps
- Add new controller metadata properties to `BridgeController` ([#6589](https://github.com/MetaMask/core/pull/6589))

### Changed

- Bump `@metamask/controller-utils` from `^11.12.0` to `^11.14.0` ([#6620](https://github.com/MetaMask/core/pull/6620), [#6629](https://github.com/MetaMask/core/pull/6629))
- Bump `@metamask/base-controller` from `^8.3.0` to `^8.4.0` ([#6632](https://github.com/MetaMask/core/pull/6632))

## [43.0.0]

### Added

- Add `totalFeeAmountUsd` to `quote` to support rewards estimation ([#6592](https://github.com/MetaMask/core/pull/6592))

### Changed

- **BREAKING:** Bump peer dependency `@metamask/assets-controller` from `^74.0.0` to `^75.0.0` ([#6570](https://github.com/MetaMask/core/pull/6570))
- Bump `@metamask/keyring-api` from `^20.1.0` to `^21.0.0` ([#6560](https://github.com/MetaMask/core/pull/6560))
- Add optional `isGaslessSwapEnabled` LaunchDarkly config to feature flags schema ([#6573](https://github.com/MetaMask/core/pull/6573))
- Bump `@metamask/utils` from `^11.4.2` to `^11.8.0` ([#6588](https://github.com/MetaMask/core/pull/6588))

## [42.0.0]

### Added

- Add `gas_included_7702` field to metrics tracking for EIP-7702 gasless transactions ([#6363](https://github.com/MetaMask/core/pull/6363))

### Changed

- **BREAKING** Rename QuotesError and InputSourceDestinationSwitched events to match segment schema ([#6447](https://github.com/MetaMask/core/pull/6447))
- Bump `@metamask/base-controller` from `^8.2.0` to `^8.3.0` ([#6465](https://github.com/MetaMask/core/pull/6465))
- **BREAKING** Rename `gasless7702` to `gasIncluded7702` in QuoteRequest and Quote types

## [41.4.0]

### Added

- Add Bitcoin as a supported bridge chain ([#6389](https://github.com/MetaMask/core/pull/6389))
- Export `isBitcoinChainId` utility function ([#6389](https://github.com/MetaMask/core/pull/6389))

## [41.3.0]

### Added

- Publish `QuotesValidationFailed` and `StatusValidationFailed` events ([#6362](https://github.com/MetaMask/core/pull/6362))

## [41.2.0]

### Changed

- Update quotes to account for minDestTokenAmount ([#6373](https://github.com/MetaMask/core/pull/6373))

## [41.1.0]

### Added

- Add `UnifiedSwapBridgeEventName.AssetDetailTooltipClicked` event ([#6352](https://github.com/MetaMask/core/pull/6352))

### Changed

- Bump `@metamask/base-controller` from `^8.1.0` to `^8.2.0` ([#6355](https://github.com/MetaMask/core/pull/6355))

## [41.0.0]

### Added

- Add `gasless7702` field to QuoteRequest and Quote types to support EIP-7702 delegated gasless execution ([#6346](https://github.com/MetaMask/core/pull/6346))

### Fixed

- **BREAKING** Update the implementation of `UnifiedSwapBridgeEventName.Submitted` to require event publishers to provide all properties. This is in needed because the Submitted event can be published after the BridgeController's state has been reset ([#6314](https://github.com/MetaMask/core/pull/6314))

## [40.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` from `^32.0.0` to `^33.0.0` ([#6345](https://github.com/MetaMask/core/pull/6345))
- **BREAKING:** Bump peer dependency `@metamask/assets-controller` from `^73.0.0` to `^74.0.0` ([#6345](https://github.com/MetaMask/core/pull/6345))
- **BREAKING:** Bump peer dependency `@metamask/transaction-controller` from `^59.0.0` to `^60.0.0` ([#6345](https://github.com/MetaMask/core/pull/6345))
- Bump accounts related packages ([#6309](https://github.com/MetaMask/core/pull/6309))
  - Bump `@metamask/keyring-api` from `^20.0.0` to `^20.1.0`
- Bump `@metamask/assets-controller` from `^73.2.0` to `^73.3.0` ([#6334](https://github.com/MetaMask/core/pull/6334))

## [39.1.0]

### Fixed

- Ignore error messages thrown when quote requests are cancelled. This prevents the `QuoteError` event from being published when an error is expected ([#6299](https://github.com/MetaMask/core/pull/6299))

## [39.0.1]

### Changed

- Bump `@metamask/controller-utils` from `^11.11.0` to `^11.12.0` ([#6303](https://github.com/MetaMask/core/pull/6303))

## [39.0.0]

### Added

- **BREAKING** Added the `effective`, `max` and `total` keys to the `QuoteMetadata.gasFee` type ([#6295](https://github.com/MetaMask/core/pull/6295))
- Response validation for the QuoteReponse.trade.effectiveGas field ([#6295](https://github.com/MetaMask/core/pull/6295))
- Calculate the effective gas (amount spent after refunds) for transactions and use it to sort quotes. This value is reflected in the `totalNetworkFee` ([#6295](https://github.com/MetaMask/core/pull/6295))
  - The `totalNetworkFee` should be displayed along with the client quotes
  - The `totalMaxNetworkFee` should be used to disable tx submission

### Changed

- **BREAKING** Remove `getActionType` export and hardcode `action_type` to `swapbridge-v1`. Deprecate `crosschain-v1` MetricsActionType because it shouldn't be used after swaps and bridge are unified ([#6270](https://github.com/MetaMask/core/pull/6270))
- Change default gas priority fee level from high -> medium to show more accurate estimates in the clients ([#6295](https://github.com/MetaMask/core/pull/6295))
- Bump `@metamask/multichain-network-controller` from `^0.11.0` to `^0.11.1` ([#6273](https://github.com/MetaMask/core/pull/6273))
- Bump `@metamask/base-controller` from `^8.0.1` to `^8.1.0` ([#6284](https://github.com/MetaMask/core/pull/6284))

## [38.0.0]

### Fixed

- **BREAKING** Require clients to define `can_submit` property when publishing `QuoteSelected`, `AllQuotesSorted`, `AllQuotesOpened` and `QuotesReceived` events ([#6254](https://github.com/MetaMask/core/pull/6254))
- Rename the InputChanged event's `value` property key to `input_value` ([#6254](https://github.com/MetaMask/core/pull/6254))

## [37.2.0]

### Added

- Expose `fetchQuotes` method that returns a list of quotes directly rather than adding them to the controller state. This enables clients to retrieve quotes directly without automatic polling and state management ([#6236](https://github.com/MetaMask/core/pull/6236))

### Changed

- Bump `@metamask/keyring-api` from `^19.0.0` to `^20.0.0` ([#6248](https://github.com/MetaMask/core/pull/6248))

## [37.1.0]

### Added

- Add schema for the new price impact threshold feature flag to the types for PlatformConfigSchema ([#6223](https://github.com/MetaMask/core/pull/6223))

## [37.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` from `^31.0.0` to `^32.0.0` ([#6171](https://github.com/MetaMask/core/pull/6171))
- **BREAKING:** Bump peer dependency `@metamask/assets-controllers` from `^72.0.0` to `^73.0.0` ([#6171](https://github.com/MetaMask/core/pull/6171))
- **BREAKING:** Bump peer dependency `@metamask/transaction-controller` from `^58.0.0` to `^59.0.0` ([#6171](https://github.com/MetaMask/core/pull/6171)), ([#6027](https://github.com/MetaMask/core/pull/6027))

## [36.2.0]

### Changed

- Bump `@metamask/keyring-api` from `^18.0.0` to `^19.0.0` ([#6146](https://github.com/MetaMask/core/pull/6146))

## [36.1.0]

### Changed

- Include EVM assetIds in `isNativeAddress` util when checking whether an address string is a native token ([#6076](https://github.com/MetaMask/core/pull/6076))

## [36.0.0]

### Changed

- Bump `@metamask/multichain-network-controller` from `^0.9.0` to `^0.10.0` ([#6114](https://github.com/MetaMask/core/pull/6114))
- **BREAKING** Require `destWalletAddress` in `isValidQuoteRequest` if bridging to or from Solana ([#6091](https://github.com/MetaMask/core/pull/6091))
- Bump `@metamask/assets-controllers` to `^72.0.0` ([#6120](https://github.com/MetaMask/core/pull/6120))

## [35.0.0]

### Added

- Add an optional `isSingleSwapBridgeButtonEnabled` feature flag that indicates whether Swap and Bridge entrypoints should be combined ([#6078](https://github.com/MetaMask/core/pull/6078))

### Changed

- **BREAKING:** Bump peer dependency `@metamask/assets-controllers` from `^69.0.0` to `^71.0.0` ([#6061](https://github.com/MetaMask/core/pull/6061), [#6098](https://github.com/MetaMask/core/pull/6098))
- **BREAKING:** Bump peer dependency `@metamask/snaps-controllers` from `^12.0.0` to `^14.0.0` ([#6035](https://github.com/MetaMask/core/pull/6035))
- **BREAKING** Remove `isSnapConfirmationEnabled` feature flag from `ChainConfigurationSchema` validation ([#6077](https://github.com/MetaMask/core/pull/6077))
- Bump `@metamask/controller-utils` from `^11.10.0` to `^11.11.0` ([#6069](https://github.com/MetaMask/core/pull/6069))
- Bump `@metamask/utils` from `^11.2.0` to `^11.4.2` ([#6054](https://github.com/MetaMask/core/pull/6054))

## [34.0.0]

### Added

- **BREAKING** Add a required `gasIncluded` quote request parameter to indicate whether the bridge-api should return gasless swap quotes. The clients need to pass in a Boolean value indicating whether the user is opted in to STX and if their current network has STX support ([#6030](https://github.com/MetaMask/core/pull/6030))
- Add `gasIncluded` to QuoteResponse, which indicates whether the quote includes tx fees (gas-less) ([#6030](https://github.com/MetaMask/core/pull/6030))
- Add `feeData.txFees` to QuoteResponse, which contains data about tx fees taken from either the source or destination asset ([#6030](https://github.com/MetaMask/core/pull/6030))
- Add `includedTxFees` to QuoteMetadata, which clients can display as the included tx fee when displaying a gasless quote ([#6039](https://github.com/MetaMask/core/pull/6039))
- Calculate and return value of `includedTxFees` ([#6039](https://github.com/MetaMask/core/pull/6039))

### Changed

- Consolidate validator and type definitions for `QuoteResponse`, `BridgeAsset` and `PlatformConfigSchema` so new response fields only need to be defined once ([#6030](https://github.com/MetaMask/core/pull/6030))
- Add `txFees` to total sentAmount ([#6039](https://github.com/MetaMask/core/pull/6039))
- When gas is included and is taken from the destination token amount, ignore network fees in `adjustedReturn` calculation ([#6039](https://github.com/MetaMask/core/pull/6039))

### Fixed

- Calculate EVM token exchange rates accurately in `selectExchangeRateByChainIdAndAddress` when the `marketData` conversion rate is in the native currency ([#6030](https://github.com/MetaMask/core/pull/6030))
- Convert `trade.value` to decimal when calculating relayer fee ([#6039](https://github.com/MetaMask/core/pull/6039))
- Revert QuoteResponse ChainId schema to expect a number instead of a string ([#6045](https://github.com/MetaMask/core/pull/6045))

## [33.0.1]

### Fixed

- Set correct `can_submit` property on Unified SwapBridge events ([#5993](https://github.com/MetaMask/core/pull/5993))
- Use activeQuote to populate default properties for Submitted and Failed events, if tx fails before being confirmed on chain ([#5993](https://github.com/MetaMask/core/pull/5993))

## [33.0.0]

### Added

- Add `stopPollingForQuotes` handler that stops quote polling without resetting the bridge controller's state ([#5994](https://github.com/MetaMask/core/pull/5994))

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` to `^31.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))
- **BREAKING:** Bump peer dependency `@metamask/assets-controller` to `^69.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))
- **BREAKING:** Bump peer dependency `@metamask/network-controller` to `^24.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))
- **BREAKING:** Bump peer dependency `@metamask/transaction-controller` to `^58.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))
- Bump dependency `@metamask/gas-fee-controller` to `^24.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))
- Bump dependency `@metamask/multichain-network-controller` to `^0.9.0` ([#5999](https://github.com/MetaMask/core/pull/5999))
- Bump dependency `@metamask/polling-controller` to `^14.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))

## [32.2.0]

### Changed

- Export feature flag util for bridge status controller ([#5961](https://github.com/MetaMask/core/pull/5961))

## [32.1.2]

### Changed

- Bump `@metamask/controller-utils` to `^11.10.0` ([#5935](https://github.com/MetaMask/core/pull/5935))
- Bump `@metamask/transaction-controller` to `^57.3.0` ([#5954](https://github.com/MetaMask/core/pull/5954))

## [32.1.1]

### Fixed

- Fetch `minimumBalanceForRentExemptionInLamports` asynchronously to prevent blocking the getQuote network call ([#5921](https://github.com/MetaMask/core/pull/5921))
- Fix invalid `getMinimumBalanceForRentExemption` commitment parameter ([#5921](https://github.com/MetaMask/core/pull/5921))

## [32.1.0]

### Added

- Include all invalid quote properties in sentry logs ([#5913](https://github.com/MetaMask/core/pull/5913))

## [32.0.1]

### Fixed

- Remove `error_message` property from QuotesRequested event payload ([#5900](https://github.com/MetaMask/core/pull/5900))
- Fail gracefully when fee calculations return invalid value or throw errors
  - Filter out single quote if `TransactionController.getLayer1GasFee` returns `undefined` ([#5910](https://github.com/MetaMask/core/pull/5910))
  - Filter out single quote if an error is thrown by `getLayer1GasFee` ([#5910](https://github.com/MetaMask/core/pull/5910))
  - Filter out single quote if an error is thrown by Solana snap's `getFeeForTransaction` method ([#5910](https://github.com/MetaMask/core/pull/5910))

## [32.0.0]

### Added

- **BREAKING:** Add required property `minimumBalanceForRentExemptionInLamports` to `BridgeState` ([#5827](https://github.com/MetaMask/core/pull/5827))
- Add selector `selectMinimumBalanceForRentExemptionInSOL` ([#5827](https://github.com/MetaMask/core/pull/5827))

### Changed

- Add new dependency `uuid` ([#5827](https://github.com/MetaMask/core/pull/5827))

## [31.0.0]

### Added

- Add `SEI` network support ([#5695](https://github.com/MetaMask/core/pull/5695))
  - Add `SEI` into constants `ALLOWED_BRIDGE_CHAIN_IDS`, `SWAPS_TOKEN_OBJECT` and `NETWORK_TO_NAME_MAP`

### Changed

- **BREAKING:** Bump `@metamask/assets-controller` peer dependency to `^68.0.0` ([#5894](https://github.com/MetaMask/core/pull/5894))

## [30.0.0]

### Changed

- **BREAKING:** Bump `@metamask/assets-controller` peer dependency to `^67.0.0` ([#5888](https://github.com/MetaMask/core/pull/5888))
- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency to `^30.0.0` ([#5888](https://github.com/MetaMask/core/pull/5888))
- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^57.0.0` ([#5888](https://github.com/MetaMask/core/pull/5888))
- **BREAKING:** Bump `@metamask/snaps-controllers` peer dependency from `^11.0.0` to `^12.0.0` ([#5871](https://github.com/MetaMask/core/pull/5871))
- Bump `@metamask/keyring-api` dependency from `^17.4.0` to `^18.0.0` ([#5871](https://github.com/MetaMask/core/pull/5871))

## [29.0.0]

### Changed

- **BREAKING:** Bump `@metamask/assets-controller` peer dependency to `^66.0.0` ([#5872](https://github.com/MetaMask/core/pull/5872))

## [28.0.0]

### Changed

- **BREAKING:** Bump `@metamask/assets-controller` peer dependency to `^65.0.0` ([#5863](https://github.com/MetaMask/core/pull/5863))

## [27.0.0]

### Changed

- **BREAKING:** Bump `@metamask/assets-controller` peer dependency to `^64.0.0` ([#5854](https://github.com/MetaMask/core/pull/5854))

## [26.0.0]

### Added

- **BREAKING:** Added a required `minimumVersion` to feature flag response schema ([#5834](https://github.com/MetaMask/core/pull/5834))

### Changed

- Consume `bridgeConfigV2` in the feature flag response schema for Mobile and export `DEFAULT_FEATURE_FLAG_CONFIG` ([#5837](https://github.com/MetaMask/core/pull/5837))

## [25.1.0]

### Added

- Added optional `isUnifiedUIEnabled` flag to chain-level feature-flag `ChainConfiguration` type and updated the validation schema to accept the new flag ([#5783](https://github.com/MetaMask/core/pull/5783))
- Add and export `calcSlippagePercentage`, a utility that calculates the absolute slippage percentage based on the adjusted return and the sent amount ([#5723](https://github.com/MetaMask/core/pull/5723)).
- Error logs for invalid getQuote responses ([#5816](https://github.com/MetaMask/core/pull/5816))

### Changed

- Bump `@metamask/controller-utils` to `^11.9.0` ([#5812](https://github.com/MetaMask/core/pull/5812))

## [25.0.1]

### Fixed

- Use zero address as solana's default native address instead of assetId ([#5799](https://github.com/MetaMask/core/pull/5799))

## [25.0.0]

### Changed

- **BREAKING:** bump `@metamask/accounts-controller` peer dependency to `^29.0.0` ([#5802](https://github.com/MetaMask/core/pull/5802))
- **BREAKING:** bump `@metamask/assets-controllers` peer dependency to `^63.0.0` ([#5802](https://github.com/MetaMask/core/pull/5802))
- **BREAKING:** bump `@metamask/transaction-controller` peer dependency to `^56.0.0` ([#5802](https://github.com/MetaMask/core/pull/5802))

## [24.0.0]

### Added

- Sentry traces for `BridgeQuotesFetched` and `SwapQuotesFetched` events ([#5780](https://github.com/MetaMask/core/pull/5780))
- Export `isCrossChain` utility ([#5780](https://github.com/MetaMask/core/pull/5780))

### Changed

- **BREAKING:** Remove `BridgeToken` export ([#5768](https://github.com/MetaMask/core/pull/5768))
- `traceFn` added to BridgeController constructor to enable clients to pass in a custom sentry trace handler ([#5768](https://github.com/MetaMask/core/pull/5768))

## [23.0.0]

### Changed

- **BREAKING** Rename `QuoteResponse.bridgePriceData` to `priceData` ([#5784](https://github.com/MetaMask/core/pull/5784))

### Fixed

- Handle cancelled bridge quote polling gracefully by skipping state updates ([#5787](https://github.com/MetaMask/core/pull/5787))

## [22.0.0]

### Changed

- **BREAKING:** Bump `@metamask/assets-controller` peer dependency to `^62.0.0` ([#5780](https://github.com/MetaMask/core/pull/5780))
- Bump `@metamask/controller-utils` to `^11.8.0` ([#5765](https://github.com/MetaMask/core/pull/5765))

## [21.0.0]

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency to `^28.0.0` ([#5763](https://github.com/MetaMask/core/pull/5763))
- **BREAKING:** Bump `@metamask/assets-controller` peer dependency to `^61.0.0` ([#5763](https://github.com/MetaMask/core/pull/5763))
- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^55.0.0` ([#5763](https://github.com/MetaMask/core/pull/5763))

## [20.0.0]

### Changed

- Bump `@metamask/base-controller` from ^8.0.0 to ^8.0.1 ([#5722](https://github.com/MetaMask/core/pull/5722))
- Update `Quote` type with `bridgePriceData`, which includes metadata about transferred amounts and the trade's priceImpact ([#5721](https://github.com/MetaMask/core/pull/5721))
- Include submitted quote's `priceImpact` as a property in analytics events ([#5721](https://github.com/MetaMask/core/pull/5721))
- **BREAKING:** Add additional required properties to Submitted, Completed, Failed and SnapConfirmationViewed events ([#5721](https://github.com/MetaMask/core/pull/5721))
- **BREAKING:** Use `RemoteFeatureFlagController` to fetch feature flags, removed client specific feature flag keys. The feature flags you receive are now client specific based on the `RemoteFeatureFlagController` state. ([#5708](https://github.com/MetaMask/core/pull/5708))

### Fixed

- Update MetricsSwapType.SINGLE to `single_chain` to match segment events schema ([#5721](https://github.com/MetaMask/core/pull/5721))

## [19.0.0]

### Changed

- **BREAKING:** Bump `@metamask/assets-controllers` peer dependency to `^60.0.0` ([#5717](https://github.com/MetaMask/core/pull/5717))

## [18.0.0]

### Changed

- **BREAKING:** Bump `@metamask/assets-controllers` peer dependency to `^59.0.0` ([#5712](https://github.com/MetaMask/core/pull/5712))

## [17.0.0]

### Added

- Add analytics events for the Unified SwapBridge experience ([#5684](https://github.com/MetaMask/core/pull/5684))

### Changed

- Bump `@metamask/multichain-network-controller` dependency to `^0.5.1` ([#5678](https://github.com/MetaMask/core/pull/5678))
- **BREAKING:** trackMetaMetricsFn added to BridgeController constructor to enable clients to pass in a custom analytics handler ([#5684](https://github.com/MetaMask/core/pull/5684))
- **BREAKING:** added a context argument to `updateBridgeQuoteRequestParams` to provide values required for analytics events ([#5684](https://github.com/MetaMask/core/pull/5684))

### Fixed

- Fixes undefined native EVM exchange rates and snap handler calls ([#5696](https://github.com/MetaMask/core/pull/5696))

## [16.0.0]

### Changed

- **BREAKING** Bump `@metamask/assets-controllers` peer dependency to `^58.0.0` ([#5672](https://github.com/MetaMask/core/pull/5672))
- **BREAKING** Bump `@metamask/snaps-controllers` peer dependency from ^9.19.0 to ^11.0.0 ([#5639](https://github.com/MetaMask/core/pull/5639))
- Bump `@metamask/multichain-network-controller` dependency to `^0.5.0` ([#5669](https://github.com/MetaMask/core/pull/5669))

## [15.0.0]

### Changed

- **BREAKING:** Bump `@metamask/assets-controllers` peer dependency to `^57.0.0` ([#5665](https://github.com/MetaMask/core/pull/5665))

## [14.0.0]

### Added

- **BREAKING:** Add `@metamask/assets-controllers` as a required peer dependency at `^56.0.0` ([#5614](https://github.com/MetaMask/core/pull/5614))
- Add `reselect` as a dependency at `^5.1.1` ([#5614](https://github.com/MetaMask/core/pull/5614))
- **BREAKING:** assetExchangeRates added to BridgeController state to support tokens which are not supported by assets controllers ([#5614](https://github.com/MetaMask/core/pull/5614))
- selectExchangeRateByChainIdAndAddress selector added, which looks up exchange rates from assets and bridge controller states ([#5614](https://github.com/MetaMask/core/pull/5614))
- selectBridgeQuotes selector added, which returns sorted quotes including their metadata ([#5614](https://github.com/MetaMask/core/pull/5614))
- selectIsQuoteExpired selector added, which returns whether quotes are expired or stale ([#5614](https://github.com/MetaMask/core/pull/5614))

### Changed

- **BREAKING:** Change TokenAmountValues key types from BigNumber to string ([#5614](https://github.com/MetaMask/core/pull/5614))
- **BREAKING:** Assets controller getState actions have been added to `AllowedActions` so clients will need to include `TokenRatesController:getState`,`MultichainAssetsRatesController:getState` and `CurrencyRateController:getState` in controller initializations ([#5614](https://github.com/MetaMask/core/pull/5614))
- Make srcAsset and destAsset optional in Step type to be optional ([#5614](https://github.com/MetaMask/core/pull/5614))
- Make QuoteResponse trade generic to support Solana quotes which have string trade data ([#5614](https://github.com/MetaMask/core/pull/5614))
- Bump `@metamask/multichain-network-controller` peer dependency to `^0.4.0` ([#5649](https://github.com/MetaMask/core/pull/5649))

## [13.0.0]

### Changed

- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^54.0.0` ([#5615](https://github.com/MetaMask/core/pull/5615))

## [12.0.0]

### Added

- Occurrences added to BridgeToken type ([#5572](https://github.com/MetaMask/core/pull/5572))

### Changed

- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^53.0.0` ([#5585](https://github.com/MetaMask/core/pull/5585))
- Bump `@metamask/controller-utils` to `^11.7.0` ([#5583](https://github.com/MetaMask/core/pull/5583))

## [11.0.0]

### Added

- BREAKING: Bump dependency @metamask/keyring-api to ^17.2.0 ([#5486](https://github.com/MetaMask/core/pull/5486))
- BREAKING: Bump dependency @metamask/multichain-network-controller to ^0.3.0 ([#5486](https://github.com/MetaMask/core/pull/5486))
- BREAKING: Bump dependency @metamask/snaps-utils to ^8.10.0 ([#5486](https://github.com/MetaMask/core/pull/5486))
- BREAKING: Bump peer dependency @metamask/snaps-controllers to ^9.19.0 ([#5486](https://github.com/MetaMask/core/pull/5486))
- Solana constants, utils, quote and token support ([#5486](https://github.com/MetaMask/core/pull/5486))
- Utilities to convert chainIds between `ChainId`, `Hex`, `string` and `CaipChainId` ([#5486](https://github.com/MetaMask/core/pull/5486))
- Add `refreshRate` feature flag to enable chain-specific quote refresh intervals ([#5486](https://github.com/MetaMask/core/pull/5486))
- `isNativeAddress` and `isSolanaChainId` utilities that can be used by both the controller and clients ([#5486](https://github.com/MetaMask/core/pull/5486))

### Changed

- Replace QuoteRequest usages with `GenericQuoteRequest` to support both EVM and multichain input parameters ([#5486](https://github.com/MetaMask/core/pull/5486))
- Make `QuoteRequest.slippage` optional ([#5486](https://github.com/MetaMask/core/pull/5486))
- Deprecate `SwapsTokenObject` and replace usages with multichain BridgeAsset ([#5486](https://github.com/MetaMask/core/pull/5486))
- Changed `bridgeFeatureFlags.extensionConfig.chains` to key configs by CAIP chainIds ([#5486](https://github.com/MetaMask/core/pull/5486))

## [10.0.0]

### Changed

- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^52.0.0` ([#5513](https://github.com/MetaMask/core/pull/5513))

## [9.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` to `^27.0.0` ([#5507](https://github.com/MetaMask/core/pull/5507))
- **BREAKING:** Bump peer dependency `@metamask/network-controller` to `^23.0.0` ([#5507](https://github.com/MetaMask/core/pull/5507))
- **BREAKING:** Bump peer dependency `@metamask/transaction-controller` to `^51.0.0` ([#5507](https://github.com/MetaMask/core/pull/5507))
- Bump `@metamask/polling-controller` to `^13.0.0` ([#5507](https://github.com/MetaMask/core/pull/5507))

## [8.0.0]

### Changed

- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^50.0.0` ([#5496](https://github.com/MetaMask/core/pull/5496))

## [7.0.0]

### Changed

- Bump `@metamask/accounts-controller` dev dependency to `^26.1.0` ([#5481](https://github.com/MetaMask/core/pull/5481))
- **BREAKING:** Allow changing the Bridge API url through the `config` param in the constructor. Remove previous method of doing it through `process.env`. ([#5465](https://github.com/MetaMask/core/pull/5465))

### Fixed

- Make `QuoteResponse.approval` optional to align with response from API ([#5475](https://github.com/MetaMask/core/pull/5475))
- Export enums properly rather than as types ([#5466](https://github.com/MetaMask/core/pull/5466))

## [6.0.0]

### Changed

- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^49.0.0` ([#5471](https://github.com/MetaMask/core/pull/5471))

## [5.0.0]

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency to `^26.0.0` ([#5439](https://github.com/MetaMask/core/pull/5439))
- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^48.0.0` ([#5439](https://github.com/MetaMask/core/pull/5439))

## [4.0.0]

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency to `^25.0.0` ([#5426](https://github.com/MetaMask/core/pull/5426))
- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^47.0.0` ([#5426](https://github.com/MetaMask/core/pull/5426))

## [3.0.0]

### Changed

- **BREAKING:** Switch over from `ethers` at v6 to `@ethersproject` packages at v5.7.0 for mobile compatibility ([#5416](https://github.com/MetaMask/core/pull/5416))
- Improve `BridgeController` API response validation readability by using `@metamask/superstruct` ([#5408](https://github.com/MetaMask/core/pull/5408))

## [2.0.0]

### Added

- Mobile feature flags ([#5359](https://github.com/MetaMask/core/pull/5359))

### Changed

- **BREAKING:** Change `BridgeController` state structure to have all fields at root of state ([#5406](https://github.com/MetaMask/core/pull/5406))
- **BREAKING:** Change `BridgeController` state defaults to `null` instead of `undefined` ([#5406](https://github.com/MetaMask/core/pull/5406))

## [1.0.0]

### Added

- Initial release ([#5317](https://github.com/MetaMask/core/pull/5317))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@67.2.0...HEAD
[67.2.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@67.1.1...@metamask/bridge-controller@67.2.0
[67.1.1]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@67.1.0...@metamask/bridge-controller@67.1.1
[67.1.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@67.0.0...@metamask/bridge-controller@67.1.0
[67.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@66.2.0...@metamask/bridge-controller@67.0.0
[66.2.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@66.1.1...@metamask/bridge-controller@66.2.0
[66.1.1]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@66.1.0...@metamask/bridge-controller@66.1.1
[66.1.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@66.0.0...@metamask/bridge-controller@66.1.0
[66.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@65.3.0...@metamask/bridge-controller@66.0.0
[65.3.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@65.2.0...@metamask/bridge-controller@65.3.0
[65.2.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@65.1.0...@metamask/bridge-controller@65.2.0
[65.1.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@65.0.1...@metamask/bridge-controller@65.1.0
[65.0.1]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@65.0.0...@metamask/bridge-controller@65.0.1
[65.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@64.8.2...@metamask/bridge-controller@65.0.0
[64.8.2]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@64.8.1...@metamask/bridge-controller@64.8.2
[64.8.1]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@64.8.0...@metamask/bridge-controller@64.8.1
[64.8.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@64.7.0...@metamask/bridge-controller@64.8.0
[64.7.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@64.6.1...@metamask/bridge-controller@64.7.0
[64.6.1]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@64.6.0...@metamask/bridge-controller@64.6.1
[64.6.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@64.5.1...@metamask/bridge-controller@64.6.0
[64.5.1]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@64.5.0...@metamask/bridge-controller@64.5.1
[64.5.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@64.4.1...@metamask/bridge-controller@64.5.0
[64.4.1]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@64.4.0...@metamask/bridge-controller@64.4.1
[64.4.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@64.3.0...@metamask/bridge-controller@64.4.0
[64.3.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@64.2.0...@metamask/bridge-controller@64.3.0
[64.2.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@64.1.0...@metamask/bridge-controller@64.2.0
[64.1.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@64.0.0...@metamask/bridge-controller@64.1.0
[64.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@63.2.0...@metamask/bridge-controller@64.0.0
[63.2.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@63.1.0...@metamask/bridge-controller@63.2.0
[63.1.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@63.0.0...@metamask/bridge-controller@63.1.0
[63.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@62.0.0...@metamask/bridge-controller@63.0.0
[62.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@61.0.0...@metamask/bridge-controller@62.0.0
[61.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@60.1.0...@metamask/bridge-controller@61.0.0
[60.1.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@60.0.0...@metamask/bridge-controller@60.1.0
[60.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@59.0.0...@metamask/bridge-controller@60.0.0
[59.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@58.0.0...@metamask/bridge-controller@59.0.0
[58.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@57.0.0...@metamask/bridge-controller@58.0.0
[57.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@56.0.3...@metamask/bridge-controller@57.0.0
[56.0.3]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@56.0.2...@metamask/bridge-controller@56.0.3
[56.0.2]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@56.0.1...@metamask/bridge-controller@56.0.2
[56.0.1]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@56.0.0...@metamask/bridge-controller@56.0.1
[56.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@55.0.0...@metamask/bridge-controller@56.0.0
[55.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@54.0.0...@metamask/bridge-controller@55.0.0
[54.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@53.1.0...@metamask/bridge-controller@54.0.0
[53.1.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@53.0.0...@metamask/bridge-controller@53.1.0
[53.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@52.0.0...@metamask/bridge-controller@53.0.0
[52.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@51.0.0...@metamask/bridge-controller@52.0.0
[51.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@50.0.0...@metamask/bridge-controller@51.0.0
[50.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@49.0.1...@metamask/bridge-controller@50.0.0
[49.0.1]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@49.0.0...@metamask/bridge-controller@49.0.1
[49.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@48.0.0...@metamask/bridge-controller@49.0.0
[48.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@47.2.0...@metamask/bridge-controller@48.0.0
[47.2.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@47.1.0...@metamask/bridge-controller@47.2.0
[47.1.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@47.0.0...@metamask/bridge-controller@47.1.0
[47.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@46.0.0...@metamask/bridge-controller@47.0.0
[46.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@45.0.0...@metamask/bridge-controller@46.0.0
[45.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@44.0.1...@metamask/bridge-controller@45.0.0
[44.0.1]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@44.0.0...@metamask/bridge-controller@44.0.1
[44.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@43.2.1...@metamask/bridge-controller@44.0.0
[43.2.1]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@43.2.0...@metamask/bridge-controller@43.2.1
[43.2.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@43.1.0...@metamask/bridge-controller@43.2.0
[43.1.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@43.0.0...@metamask/bridge-controller@43.1.0
[43.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@42.0.0...@metamask/bridge-controller@43.0.0
[42.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@41.4.0...@metamask/bridge-controller@42.0.0
[41.4.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@41.3.0...@metamask/bridge-controller@41.4.0
[41.3.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@41.2.0...@metamask/bridge-controller@41.3.0
[41.2.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@41.1.0...@metamask/bridge-controller@41.2.0
[41.1.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@41.0.0...@metamask/bridge-controller@41.1.0
[41.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@40.0.0...@metamask/bridge-controller@41.0.0
[40.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@39.1.0...@metamask/bridge-controller@40.0.0
[39.1.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@39.0.1...@metamask/bridge-controller@39.1.0
[39.0.1]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@39.0.0...@metamask/bridge-controller@39.0.1
[39.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@38.0.0...@metamask/bridge-controller@39.0.0
[38.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@37.2.0...@metamask/bridge-controller@38.0.0
[37.2.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@37.1.0...@metamask/bridge-controller@37.2.0
[37.1.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@37.0.0...@metamask/bridge-controller@37.1.0
[37.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@36.2.0...@metamask/bridge-controller@37.0.0
[36.2.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@36.1.0...@metamask/bridge-controller@36.2.0
[36.1.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@36.0.0...@metamask/bridge-controller@36.1.0
[36.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@35.0.0...@metamask/bridge-controller@36.0.0
[35.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@34.0.0...@metamask/bridge-controller@35.0.0
[34.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@33.0.1...@metamask/bridge-controller@34.0.0
[33.0.1]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@33.0.0...@metamask/bridge-controller@33.0.1
[33.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@32.2.0...@metamask/bridge-controller@33.0.0
[32.2.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@32.1.2...@metamask/bridge-controller@32.2.0
[32.1.2]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@32.1.1...@metamask/bridge-controller@32.1.2
[32.1.1]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@32.1.0...@metamask/bridge-controller@32.1.1
[32.1.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@32.0.1...@metamask/bridge-controller@32.1.0
[32.0.1]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@32.0.0...@metamask/bridge-controller@32.0.1
[32.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@31.0.0...@metamask/bridge-controller@32.0.0
[31.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@30.0.0...@metamask/bridge-controller@31.0.0
[30.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@29.0.0...@metamask/bridge-controller@30.0.0
[29.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@28.0.0...@metamask/bridge-controller@29.0.0
[28.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@27.0.0...@metamask/bridge-controller@28.0.0
[27.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@26.0.0...@metamask/bridge-controller@27.0.0
[26.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@25.1.0...@metamask/bridge-controller@26.0.0
[25.1.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@25.0.1...@metamask/bridge-controller@25.1.0
[25.0.1]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@25.0.0...@metamask/bridge-controller@25.0.1
[25.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@24.0.0...@metamask/bridge-controller@25.0.0
[24.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@23.0.0...@metamask/bridge-controller@24.0.0
[23.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@22.0.0...@metamask/bridge-controller@23.0.0
[22.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@21.0.0...@metamask/bridge-controller@22.0.0
[21.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@20.0.0...@metamask/bridge-controller@21.0.0
[20.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@19.0.0...@metamask/bridge-controller@20.0.0
[19.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@18.0.0...@metamask/bridge-controller@19.0.0
[18.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@17.0.0...@metamask/bridge-controller@18.0.0
[17.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@16.0.0...@metamask/bridge-controller@17.0.0
[16.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@15.0.0...@metamask/bridge-controller@16.0.0
[15.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@14.0.0...@metamask/bridge-controller@15.0.0
[14.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@13.0.0...@metamask/bridge-controller@14.0.0
[13.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@12.0.0...@metamask/bridge-controller@13.0.0
[12.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@11.0.0...@metamask/bridge-controller@12.0.0
[11.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@10.0.0...@metamask/bridge-controller@11.0.0
[10.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@9.0.0...@metamask/bridge-controller@10.0.0
[9.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@8.0.0...@metamask/bridge-controller@9.0.0
[8.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@7.0.0...@metamask/bridge-controller@8.0.0
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@6.0.0...@metamask/bridge-controller@7.0.0
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@5.0.0...@metamask/bridge-controller@6.0.0
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@4.0.0...@metamask/bridge-controller@5.0.0
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@3.0.0...@metamask/bridge-controller@4.0.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@2.0.0...@metamask/bridge-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@1.0.0...@metamask/bridge-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/bridge-controller@1.0.0
