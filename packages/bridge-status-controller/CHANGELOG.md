# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Parse event properties from the quote request if an event needs to be published prior to tx submission (i.e., Failed, Submitted) ([#6314](https://github.com/MetaMask/core/pull/6314))

## [38.1.0]

### Changed

- Add `quotedGasAmount` to txHistory ([#6299](https://github.com/MetaMask/core/pull/6299))

### Fixed

- Parse destination amount from Swap EVM tx receipt and use it to calculate finalized tx event properties ([#6299](https://github.com/MetaMask/core/pull/6299))
- Use `status.destChain.amount` from getTxStatus response to calculate actual bridged amount ([#6299](https://github.com/MetaMask/core/pull/6299))

## [38.0.1]

### Changed

- Bump `@metamask/controller-utils` from `^11.11.0` to `^11.12.0` ([#6303](https://github.com/MetaMask/core/pull/6303))

### Fixed

- Wait for Mobile hardware wallet delay before submitting Ledger tx ([#6302](https://github.com/MetaMask/core/pull/6302))

## [38.0.0]

### Added

- Include `assetsFiatValue` for sending and receiving assets in batch transaction request parameters ([#6277](https://github.com/MetaMask/core/pull/6277))

### Changed

- **BREAKING:** Bump peer dependency `@metamask/bridge-controller` to `^38.0.0` ([#6268](https://github.com/MetaMask/core/pull/6268))
- Hardcode `action_type` to `swapbridge-v1` after swaps and bridge unification ([#6270](https://github.com/MetaMask/core/pull/6270))
- Bump `@metamask/base-controller` from `^8.0.1` to `^8.1.0` ([#6284](https://github.com/MetaMask/core/pull/6284))
- Store the quote's effective gas fees as the `quotedGasInUsd` in txHistory; fallback to the total fees otherwise ([#6295](https://github.com/MetaMask/core/pull/6295))

## [37.0.1]

### Changed

- Bump `@metamask/keyring-api` from `^19.0.0` to `^20.0.0` ([#6248](https://github.com/MetaMask/core/pull/6248))

### Fixed

- Make sure to pass the `requireApproval` for ERC20 approvals ([#6204](https://github.com/MetaMask/core/pull/6204))

## [37.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` to `^32.0.0` ([#6171](https://github.com/MetaMask/core/pull/6171))
- **BREAKING:** Bump peer dependency `@metamask/bridge-controller` to `^37.0.0` ([#6171](https://github.com/MetaMask/core/pull/6171))
- **BREAKING:** Bump peer dependency `@metamask/transaction-controller` to `^59.0.0` ([#6171](https://github.com/MetaMask/core/pull/6171)), ([#6027](https://github.com/MetaMask/core/pull/6027))

## [36.1.0]

### Added

- Add `restartPollingForFailedAttempts` action to restart polling for txs that are not in a final state but have too many failed attempts ([#6149](https://github.com/MetaMask/core/pull/6149))

### Changed

- Bump `@metamask/keyring-api` from `^18.0.0` to `^19.0.0` ([#6146](https://github.com/MetaMask/core/pull/6146))

### Fixed

- Don't poll indefinitely for bridge tx status if the tx is not found. Implement exponential backoff to prevent overwhelming the bridge API. ([#6149](https://github.com/MetaMask/core/pull/6149))

## [36.0.0]

### Changed

- Bump `@metamask/bridge-controller` to `^36.0.0` ([#6120](https://github.com/MetaMask/core/pull/6120))

## [35.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/bridge-controller` to `^35.0.0` ([#6098](https://github.com/MetaMask/core/pull/6098))
- **BREAKING** Submit Solana transactions using `onClientRequest` RPC call by default, which hides the Snap confirmation page from clients. Clients will need to remove conditional redirect the the confirmation page on tx submission ([#6077](https://github.com/MetaMask/core/pull/6077))
- Bump `@metamask/controller-utils` from `^11.10.0` to `^11.11.0` ([#6069](https://github.com/MetaMask/core/pull/6069))
- Bump `@metamask/utils` from `^11.2.0` to `^11.4.2` ([#6054](https://github.com/MetaMask/core/pull/6054))

## [34.0.0]

### Added

- Add `batchId` to BridgeHistoryItem to enable querying history by batchId ([#6058](https://github.com/MetaMask/core/pull/6058))

### Changed

- **BREAKING** Add tx batching functionality, which requires an `addTransactionBatchFn` handler to be passed to the BridgeStatusController's constructor ([#6058](https://github.com/MetaMask/core/pull/6058))
- **BREAKING** Update batched txs after signing with correct tx types, which requires an `updateTransactionFn` handler to be passed to the BridgeStatusController's constructor ([#6058](https://github.com/MetaMask/core/pull/6058))
- Add approvalTxId to txHistoryItem after signing batched transaction ([#6058](https://github.com/MetaMask/core/pull/6058))
- Remove `addUserOperationFromTransaction` tx submission code and constructor arg since it is unsupported ([#6057](https://github.com/MetaMask/core/pull/6057))
- Remove @metamask/user-operation-controller dependency ([#6057](https://github.com/MetaMask/core/pull/6057))
- **BREAKING:** Bump peer dependency `@metamask/snaps-controllers` from `^12.0.0` to `^14.0.0` ([#6035](https://github.com/MetaMask/core/pull/6035))

### Fixed

- Wait until a bridge transaction is confirmed before polling for its status. This reduces (or fully removes) premature `getTxStatus` calls, and enables adding batched bridge txs to history before its transaction Id is available ([#6052](https://github.com/MetaMask/core/pull/6052))

## [33.0.0]

### Changed

- Consolidate validator and type definitions for `StatusResponse` so new response fields only need to be defined once ([#6030](https://github.com/MetaMask/core/pull/6030))

### Removed

- Clean up unused exports that duplicate @metamask/bridge-controller's ([#6030](https://github.com/MetaMask/core/pull/6030))
  - Asset
  - SrcChainStatus
  - DestChainStatus
  - RefuelData
  - FeeType
  - ActionTypes

### Fixed

- Set event property `gas_included` to quote's `gasIncluded` value ([#6030](https://github.com/MetaMask/core/pull/6030))
- Set StatusResponse ChainId schema to expect a number instead of a string ([#6045](https://github.com/MetaMask/core/pull/6045))

## [32.0.0]

### Changed

- Remove `@metamask/multichain-transactions-controller` peer dependency ([#5993](https://github.com/MetaMask/core/pull/5993))

### Fixed

- Update the following events to match the Unified SwapBridge spec ([#5993](https://github.com/MetaMask/core/pull/5993))
  - `Completed`: remove multichain tx controller subscription and emit the event based on the tx submission status instead
  - `Failed`: emit event when an error is thrown during solana tx submission
  - `Submitted`
    - set swap type for evm txs when applicable. this is currently hardcoded to bridge so swaps don't get displayed correctly on the activity list
    - emit this event when submitTx is called, regardless of confirmation status

## [31.0.0]

### Changed

- **BREAKING:** Adds a call to bridge-controller's `stopPollingForQuotes` handler to prevent quotes from refreshing during tx submission. This enables "pausing" the quote polling loop without resetting the entire state. Without this, it's possible for the activeQuote to change while the UI's tx submission is in-progress ([#5994](https://github.com/MetaMask/core/pull/5994))
- **BREAKING:** BridgeStatusController now requires the `BridgeController:stopPollingForQuotes` action permission ([#5994](https://github.com/MetaMask/core/pull/5994))
- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` to `^31.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))
- **BREAKING:** Bump peer dependency `@metamask/bridge-controller` to `^33.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))
- **BREAKING:** Bump peer dependency `@metamask/gas-fee-controller` to `^24.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))
- **BREAKING:** Bump peer dependency `@metamask/multichain-transactions-controller` to `^3.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))
- **BREAKING:** Bump peer dependency `@metamask/network-controller` to `^24.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))
- **BREAKING:** Bump peer dependency `@metamask/transaction-controller` to `^58.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))
- Bump `@metamask/polling-controller` to `^14.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))
- Bump `@metamask/user-operation-controller` to `^37.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))

### Fixed

- Parse tx signature from `onClientRequest` response in order to identify bridge transactions ([#6001](https://github.com/MetaMask/core/pull/6001))
- Prevent active quote from changing while transaction submission is in progress ([#5994](https://github.com/MetaMask/core/pull/5994))

## [30.0.0]

### Changed

- **BREAKING:** Implement onClientRequest for Solana snap transactions, now requires action permission for RemoteFeatureFlagController:getState ([#5961](https://github.com/MetaMask/core/pull/5961))

## [29.1.1]

### Changed

- Bump `@metamask/bridge-controller` to `^32.1.2` ([#5969](https://github.com/MetaMask/core/pull/5969))
- Bump `@metamask/controller-utils` to `^11.10.0` ([#5935](https://github.com/MetaMask/core/pull/5935))
- Bump `@metamask/transaction-controller` to `^57.3.0` ([#5954](https://github.com/MetaMask/core/pull/5954))

### Fixed

- Properly prompt for confirmation on Ledger on Mobile for bridge transactions ([#5931](https://github.com/MetaMask/core/pull/5931))

## [29.1.0]

### Added

- Include all invalid status properties in sentry logs ([#5913](https://github.com/MetaMask/core/pull/5913))

## [29.0.0]

### Changed

- **BREAKING:** Bump `@metamask/bridge-controller` peer dependency to `^32.0.0` ([#5896](https://github.com/MetaMask/core/pull/5896))

## [28.0.0]

### Changed

- **BREAKING:** Bump `@metamask/bridge-controller` peer dependency to `^31.0.0` ([#5894](https://github.com/MetaMask/core/pull/5894))

## [27.0.0]

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency to `^30.0.0` ([#5888](https://github.com/MetaMask/core/pull/5888))
- **BREAKING:** Bump `@metamask/bridge-controller` peer dependency to `^30.0.0` ([#5888](https://github.com/MetaMask/core/pull/5888))
- **BREAKING:** Bump `@metamask/transactions-controller` peer dependency to `^57.0.0` ([#5888](https://github.com/MetaMask/core/pull/5888))
- **BREAKING:** Bump `@metamask/multichain-transactions-controller` peer dependency to `^2.0.0` ([#5888](https://github.com/MetaMask/core/pull/5888))
- **BREAKING:** Bump `@metamask/snaps-controllers` peer dependency from `^11.0.0` to `^12.0.0` ([#5871](https://github.com/MetaMask/core/pull/5871))
- Bump `@metamask/keyring-api` dependency from `^17.4.0` to `^18.0.0` ([#5871](https://github.com/MetaMask/core/pull/5871))

## [26.0.0]

### Changed

- **BREAKING:** Bump `@metamask/bridge-controller` peer dependency to `^29.0.0` ([#5872](https://github.com/MetaMask/core/pull/5872))

## [25.0.0]

### Changed

- **BREAKING:** Bump `@metamask/bridge-controller` peer dependency to `^28.0.0` ([#5863](https://github.com/MetaMask/core/pull/5863))

## [24.0.0]

### Changed

- **BREAKING:** Bump `@metamask/bridge-controller` peer dependency to `^27.0.0` ([#5845](https://github.com/MetaMask/core/pull/5845))

## [23.0.0]

### Added

- Subscribe to TransactionController and MultichainTransactionsController tx confirmed and failed events for swaps ([#5829](https://github.com/MetaMask/core/pull/5829))

### Changed

- **BREAKING:** bump `@metamask/bridge-controller` peer dependency to `^26.0.0` ([#5842](https://github.com/MetaMask/core/pull/5842))
- **BREAKING:** Remove the published bridgeTransactionComplete and bridgeTransactionFailed events ([#5829](https://github.com/MetaMask/core/pull/5829))
- Modify events to use `swap` and `swapApproval` TransactionTypes when src and dest chain are the same ([#5829](https://github.com/MetaMask/core/pull/5829))

## [22.0.0]

### Added

- Subscribe to TransactionController and MultichainTransactionsController tx confirmed and failed events for swaps ([#5829](https://github.com/MetaMask/core/pull/5829))
- Error logs for invalid getTxStatus responses ([#5816](https://github.com/MetaMask/core/pull/5816))

### Changed

- **BREAKING:** Remove the published bridgeTransactionComplete and bridgeTransactionFailed events ([#5829](https://github.com/MetaMask/core/pull/5829))
- Modify events to use `swap` and `swapApproval` TransactionTypes when src and dest chain are the same ([#5829](https://github.com/MetaMask/core/pull/5829))
- Bump `@metamask/bridge-controller` dev dependency to `^25.0.1` ([#5811](https://github.com/MetaMask/core/pull/5811))
- Bump `@metamask/controller-utils` to `^11.9.0` ([#5812](https://github.com/MetaMask/core/pull/5812))

### Fixed

- Don't start or restart getTxStatus polling if transaction is a swap ([#5831](https://github.com/MetaMask/core/pull/5831))

## [21.0.0]

### Changed

- **BREAKING:** bump `@metamask/accounts-controller` peer dependency to `^29.0.0` ([#5802](https://github.com/MetaMask/core/pull/5802))
- **BREAKING:** bump `@metamask/bridge-controller` peer dependency to `^25.0.0` ([#5802](https://github.com/MetaMask/core/pull/5802))
- **BREAKING:** bump `@metamask/transaction-controller` peer dependency to `^56.0.0` ([#5802](https://github.com/MetaMask/core/pull/5802))

## [20.1.0]

### Added

- Sentry traces for Swap and Bridge `TransactionApprovalCompleted` and `TransactionCompleted` events ([#5780](https://github.com/MetaMask/core/pull/5780))

### Changed

- `traceFn` added to BridgeStatusController constructor to enable clients to pass in a custom sentry trace handler ([#5768](https://github.com/MetaMask/core/pull/5768))

## [20.0.0]

### Changed

- **BREAKING:** Bump `@metamask/bridge-controller` peer dependency to `^23.0.0` ([#5795](https://github.com/MetaMask/core/pull/5795))
- Replace `bridgePriceData` with `priceData` from QuoteResponse object ([#5784](https://github.com/MetaMask/core/pull/5784))

## [19.0.0]

### Changed

- **BREAKING:** Bump `@metamask/bridge-controller` peer dependency to `^22.0.0` ([#5780](https://github.com/MetaMask/core/pull/5780))
- Bump `@metamask/controller-utils` to `^11.8.0` ([#5765](https://github.com/MetaMask/core/pull/5765))

## [18.0.0]

### Changed

- **BREAKING:** Bump `@metamask/bridge-controller` peer dependency to `^21.0.0` ([#5763](https://github.com/MetaMask/core/pull/5763))
- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency to `^28.0.0` ([#5763](https://github.com/MetaMask/core/pull/5763))
- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^55.0.0` ([#5763](https://github.com/MetaMask/core/pull/5763))

## [17.0.1]

### Fixed

- Added a hardcoded `SolScope.Mainnet` value to ensure the `signAndSendTransaction` params are always valid. Discovered Solana accounts may have an undefined `options.scope`, which causes `handleRequest` calls to throw a JSON-RPC validation error ([#5750])(https://github.com/MetaMask/core/pull/5750)

## [17.0.0]

### Changed

- Includes submitted quote's `priceImpact` as a property in analytics events ([#5721](https://github.com/MetaMask/core/pull/5721))
- Bump `@metamask/base-controller` from ^8.0.0 to ^8.0.1 ([#5722](https://github.com/MetaMask/core/pull/5722))
- **BREAKING:** Bump `@metamask/bridge-controller` peer dependency to `^20.0.0` ([#5717](https://github.com/MetaMask/core/pull/5717))

## [16.0.0]

### Changed

- **BREAKING:** Bump `@metamask/bridge-controller` peer dependency to `^19.0.0` ([#5717](https://github.com/MetaMask/core/pull/5717))
- Remove `@metamask/assets-controllers` peer dependency ([#5716](https://github.com/MetaMask/core/pull/5716))

### Fixed

- Fixes transaction polling failures caused by adding tokens with the incorrect account address to the TokensControler ([#5716](https://github.com/MetaMask/core/pull/5716))

## [15.0.0]

### Changed

- **BREAKING:** Bump `@metamask/assets-controllers` peer dependency to `^59.0.0` ([#5712](https://github.com/MetaMask/core/pull/5712))
- **BREAKING:** Bump `@metamask/bridge-controller` peer dependency to `^18.0.0` ([#5712](https://github.com/MetaMask/core/pull/5712))

## [14.0.0]

### Added

- **BREAKING:** Add analytics tracking for post-tx submission events ([#5684](https://github.com/MetaMask/core/pull/5684))
- Add optional `isStxEnabled` property to `BridgeHistoryItem` to indicate whether the transaction was submitted as a smart transaction ([#5684](https://github.com/MetaMask/core/pull/5684))

### Changed

- **BREAKING:** Bump `@metamask/bridge-controller` peer dependency to `^17.0.0` ([#5700](https://github.com/MetaMask/core/pull/5700))

### Fixed

- Fixes missing EVM native exchange rates by not lowercasing the symbol used for lookups ([#5696](https://github.com/MetaMask/core/pull/5696))
- Fixes occasional snap `handleRequest` errors by setting the request scope to `SolScope.Mainnet` instead of reading it from the account metadata ([#5696](https://github.com/MetaMask/core/pull/5696))

## [13.1.0]

### Fixed

- Add optional `approvalTxId` to `BridgeHistoryItem` to prevent transaction metadata corruption ([#5670](https://github.com/MetaMask/core/pull/5670))
  - Fixes issue where `updateTransaction` was overwriting transaction metadata when associating approvals
  - Stores approval transaction ID in bridge history instead of modifying transaction metadata
  - Reduces duplicate quote data in state

## [13.0.0]

### Added

- **BREAKING:** Add `@metamask/snaps-controllers` peer dependency at `^11.0.0` ([#5634](https://github.com/MetaMask/core/pull/5634), [#5639](https://github.com/MetaMask/core/pull/5639))
- **BREAKING:** Add `@metamask/gas-fee-controller` peer dependency at `^23.0.0` ([#5643](https://github.com/MetaMask/core/pull/5643))
- **BREAKING:** Add `@metamask/assets-controllers` peer dependency at `^58.0.0` ([#5643](https://github.com/MetaMask/core/pull/5643), [#5672](https://github.com/MetaMask/core/pull/5672))
- Add `@metamask/user-operation-controller` dependency at `^33.0.0` ([#5643](https://github.com/MetaMask/core/pull/5643))
- Add `uuid` dependency at `^8.3.2` ([#5634](https://github.com/MetaMask/core/pull/5634))
- Add `@metamask/keyring-api` dependency at `^17.4.0` ([#5643](https://github.com/MetaMask/core/pull/5643))
- Add `bignumber.js` dependency at `^9.1.2` ([#5643](https://github.com/MetaMask/core/pull/5643))
- Add `submitTx` handler that submits cross-chain swaps transactions and triggers polling for destination transaction status ([#5634](https://github.com/MetaMask/core/pull/5634))
- Enable submitting EVM transactions using `submitTx` ([#5643](https://github.com/MetaMask/core/pull/5643))
- Add functionality for importing tokens from transaction after successful confirmation ([#5643](https://github.com/MetaMask/core/pull/5643))

### Changed

- **BREAKING** Change `@metamask/bridge-controller` from dependency to peer dependency and bump to `^16.0.0` ([#5657](https://github.com/MetaMask/core/pull/5657), [#5665](https://github.com/MetaMask/core/pull/5665), [#5643](https://github.com/MetaMask/core/pull/5643) [#5672](https://github.com/MetaMask/core/pull/5672))
- Add optional config.customBridgeApiBaseUrl constructor arg to set the bridge-api base URL ([#5634](https://github.com/MetaMask/core/pull/5634))
- Add required `addTransactionFn` and `estimateGasFeeFn` args to the BridgeStatusController constructor to enable calling TransactionController's methods from `submitTx` ([#5643](https://github.com/MetaMask/core/pull/5643))
- Add optional `addUserOperationFromTransactionFn` arg to the BridgeStatusController constructor to enable submitting txs from smart accounts using the UserOperationController's addUserOperationFromTransaction method ([#5643](https://github.com/MetaMask/core/pull/5643))

### Fixed

- Update validators to accept any `bridge` string in the StatusResponse ([#5634](https://github.com/MetaMask/core/pull/5634))

## [12.0.1]

### Fixed

- Add `relay` to the list of bridges in the `BridgeId` enum to prevent validation from failing ([#5623](https://github.com/MetaMask/core/pull/5623))

## [12.0.0]

### Changed

- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^54.0.0` ([#5615](https://github.com/MetaMask/core/pull/5615))

## [11.0.0]

### Changed

- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^53.0.0` ([#5585](https://github.com/MetaMask/core/pull/5585))
- Bump `@metamask/bridge-controller` dependency to `^11.0.0` ([#5525](https://github.com/MetaMask/core/pull/5525))
- **BREAKING:** Change controller to fetch multichain address instead of EVM ([#5554](https://github.com/MetaMask/core/pull/5540))

## [10.0.0]

### Changed

- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^52.0.0` ([#5513](https://github.com/MetaMask/core/pull/5513))
- Bump `@metamask/bridge-controller` peer dependency to `^10.0.0` ([#5513](https://github.com/MetaMask/core/pull/5513))

## [9.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` to `^27.0.0` ([#5507](https://github.com/MetaMask/core/pull/5507))
- **BREAKING:** Bump peer dependency `@metamask/network-controller` to `^23.0.0` ([#5507](https://github.com/MetaMask/core/pull/5507))
- **BREAKING:** Bump peer dependency `@metamask/transaction-controller` to `^51.0.0` ([#5507](https://github.com/MetaMask/core/pull/5507))
- Bump `@metamask/bridge-controller` to `^9.0.0` ([#5507](https://github.com/MetaMask/core/pull/5507))
- Bump `@metamask/polling-controller` to `^13.0.0` ([#5507](https://github.com/MetaMask/core/pull/5507))

## [8.0.0]

### Changed

- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^50.0.0` ([#5496](https://github.com/MetaMask/core/pull/5496))

## [7.0.0]

### Changed

- Bump `@metamask/accounts-controller` dev dependency to `^26.1.0` ([#5481](https://github.com/MetaMask/core/pull/5481))
- **BREAKING:** Allow changing the Bridge API url through the `config` param in the constructor. Remove previous method of doing it through `process.env`. ([#5465](https://github.com/MetaMask/core/pull/5465))

### Fixed

- `@metamask/bridge-controller` dependency is no longer a peer dependency, just a direct dependency ([#5464](https://github.com/MetaMask/core/pull/5464))

## [6.0.0]

### Changed

- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^49.0.0` ([#5471](https://github.com/MetaMask/core/pull/5471))

## [5.0.0]

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency to `^26.0.0` ([#5439](https://github.com/MetaMask/core/pull/5439))
- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^48.0.0` ([#5439](https://github.com/MetaMask/core/pull/5439))
- **BREAKING:** Bump `@metamask/bridge-controller` peer dependency to `^5.0.0` ([#5439](https://github.com/MetaMask/core/pull/5439))

## [4.0.0]

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency to `^25.0.0` ([#5426](https://github.com/MetaMask/core/pull/5426))
- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^47.0.0` ([#5426](https://github.com/MetaMask/core/pull/5426))
- **BREAKING:** Bump `@metamask/bridge-controller` peer dependency to `^4.0.0` ([#5426](https://github.com/MetaMask/core/pull/5426))

## [3.0.0]

### Changed

- **BREAKING:** Bump `@metamask/bridge-controller` to v3.0.0
- Improve `BridgeStatusController` API response validation readability by using `@metamask/superstruct` ([#5408](https://github.com/MetaMask/core/pull/5408))

## [2.0.0]

### Changed

- **BREAKING:** Change `BridgeStatusController` state structure to have all fields at root of state ([#5406](https://github.com/MetaMask/core/pull/5406))
- **BREAKING:** Redundant type `BridgeStatusState` removed from exports ([#5406](https://github.com/MetaMask/core/pull/5406))

## [1.0.0]

### Added

- Initial release ([#5317](https://github.com/MetaMask/core/pull/5317))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@38.1.0...HEAD
[38.1.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@38.0.1...@metamask/bridge-status-controller@38.1.0
[38.0.1]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@38.0.0...@metamask/bridge-status-controller@38.0.1
[38.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@37.0.1...@metamask/bridge-status-controller@38.0.0
[37.0.1]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@37.0.0...@metamask/bridge-status-controller@37.0.1
[37.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@36.1.0...@metamask/bridge-status-controller@37.0.0
[36.1.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@36.0.0...@metamask/bridge-status-controller@36.1.0
[36.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@35.0.0...@metamask/bridge-status-controller@36.0.0
[35.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@34.0.0...@metamask/bridge-status-controller@35.0.0
[34.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@33.0.0...@metamask/bridge-status-controller@34.0.0
[33.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@32.0.0...@metamask/bridge-status-controller@33.0.0
[32.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@31.0.0...@metamask/bridge-status-controller@32.0.0
[31.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@30.0.0...@metamask/bridge-status-controller@31.0.0
[30.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@29.1.1...@metamask/bridge-status-controller@30.0.0
[29.1.1]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@29.1.0...@metamask/bridge-status-controller@29.1.1
[29.1.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@29.0.0...@metamask/bridge-status-controller@29.1.0
[29.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@28.0.0...@metamask/bridge-status-controller@29.0.0
[28.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@27.0.0...@metamask/bridge-status-controller@28.0.0
[27.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@26.0.0...@metamask/bridge-status-controller@27.0.0
[26.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@25.0.0...@metamask/bridge-status-controller@26.0.0
[25.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@24.0.0...@metamask/bridge-status-controller@25.0.0
[24.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@23.0.0...@metamask/bridge-status-controller@24.0.0
[23.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@22.0.0...@metamask/bridge-status-controller@23.0.0
[22.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@21.0.0...@metamask/bridge-status-controller@22.0.0
[21.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@20.1.0...@metamask/bridge-status-controller@21.0.0
[20.1.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@20.0.0...@metamask/bridge-status-controller@20.1.0
[20.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@19.0.0...@metamask/bridge-status-controller@20.0.0
[19.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@18.0.0...@metamask/bridge-status-controller@19.0.0
[18.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@17.0.1...@metamask/bridge-status-controller@18.0.0
[17.0.1]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@17.0.0...@metamask/bridge-status-controller@17.0.1
[17.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@16.0.0...@metamask/bridge-status-controller@17.0.0
[16.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@15.0.0...@metamask/bridge-status-controller@16.0.0
[15.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@14.0.0...@metamask/bridge-status-controller@15.0.0
[14.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@13.1.0...@metamask/bridge-status-controller@14.0.0
[13.1.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@13.0.0...@metamask/bridge-status-controller@13.1.0
[13.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@12.0.1...@metamask/bridge-status-controller@13.0.0
[12.0.1]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@12.0.0...@metamask/bridge-status-controller@12.0.1
[12.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@11.0.0...@metamask/bridge-status-controller@12.0.0
[11.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@10.0.0...@metamask/bridge-status-controller@11.0.0
[10.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@9.0.0...@metamask/bridge-status-controller@10.0.0
[9.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@8.0.0...@metamask/bridge-status-controller@9.0.0
[8.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@7.0.0...@metamask/bridge-status-controller@8.0.0
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@6.0.0...@metamask/bridge-status-controller@7.0.0
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@5.0.0...@metamask/bridge-status-controller@6.0.0
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@4.0.0...@metamask/bridge-status-controller@5.0.0
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@3.0.0...@metamask/bridge-status-controller@4.0.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@2.0.0...@metamask/bridge-status-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@1.0.0...@metamask/bridge-status-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/bridge-status-controller@1.0.0
