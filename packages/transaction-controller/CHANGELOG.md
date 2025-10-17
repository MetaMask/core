# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `predictWithdraw` to `TransactionType` ([#6860](https://github.com/MetaMask/core/pull/6860))

## [60.8.0]

### Added

- Convert existing transaction to EIP-7702 on publish if `batchTransactions` are set ([#6844](https://github.com/MetaMask/core/pull/6844))
  - Add optional `newSignature` to `onPublish` callback in `TransactionBatchSingleRequest`.
- Add `MONAD` network support ([#6827](https://github.com/MetaMask/core/pull/6827))
  - Add account address relationship API support
  - Add incoming transactions API support

### Changed

- Bump `@metamask/eth-block-tracker` from `^13.0.0` to `^14.0.0` ([#6883](https://github.com/MetaMask/core/pull/6883))
- Update dependencies that indirectly use v4 of `eth-json-rpc-provider` ([#6811](https://github.com/MetaMask/core/pull/6811))

## [60.7.0]

### Added

- Add `txMeta` property to `GetSimulationConfig` callback ([#6833](https://github.com/MetaMask/core/pull/6833))

## [60.6.1]

### Changed

- Bump `@metamask/base-controller` from `^8.4.0` to `^8.4.1` ([#6807](https://github.com/MetaMask/core/pull/6807))
- Bump `@metamask/controller-utils` from `^11.14.0` to `^11.14.1` ([#6807](https://github.com/MetaMask/core/pull/6807))

## [60.6.0]

### Added

- Expose `addTransaction` and `addTransactionBatch` methods through the messenger ([#6749](https://github.com/MetaMask/core/pull/6749))
  - Add types:
    - `AddTransactionOptions`
    - `TransactionControllerAddTransactionAction`
    - `TransactionControllerAddTransactionBatchAction`
- Add new `shieldSubscriptionApprove` transaction type for shield subscription confirmation ([#6769](https://github.com/MetaMask/core/pull/6769))

## [60.5.0]

### Added

- Add `predictBuy`, `predictClaim`, `predictDeposit` and `predictSell` to `TransactionType` ([#6690](https://github.com/MetaMask/core/pull/6690))

### Changed

- Bump `@metamask/utils` from `^11.8.0` to `^11.8.1` ([#6708](https://github.com/MetaMask/core/pull/6708))

### Fixed

- Update `isFirstTimeInteraction` to be determined using recipient if token transfer. ([#6686](https://github.com/MetaMask/core/pull/6686))

## [60.4.0]

### Added

- Expose `confirmExternalTransaction`, `getNonceLock`, `getTransactions`, and `updateTransaction` actions through the messenger ([#6615](https://github.com/MetaMask/core/pull/6615))
  - Like other action methods, they are callable as `TransactionController:*`
  - Also add associated types:
    - `TransactionControllerConfirmExternalTransactionAction`
    - `TransactionControllerGetNonceLockAction`
    - `TransactionControllerGetTransactionsAction`
    - `TransactionControllerUpdateTransactionAction`

### Changed

- Bump `@metamask/controller-utils` from `^11.12.0` to `^11.14.0` ([#6620](https://github.com/MetaMask/core/pull/6620), [#6629](https://github.com/MetaMask/core/pull/6629))
- Bump `@metamask/utils` from `^11.4.2` to `^11.8.0` ([#6588](https://github.com/MetaMask/core/pull/6588))
- Bump `@metamask/base-controller` from `^8.3.0` to `^8.4.0` ([#6632](https://github.com/MetaMask/core/pull/6632))

## [60.3.0]

### Added

- Add two new controller state metadata properties: `includeInStateLogs` and `usedInUi` ([#6473](https://github.com/MetaMask/core/pull/6473))

### Changed

- Update nonce of existing transaction if converted to batch via `batchTransactions` but not first transaction ([#6528](https://github.com/MetaMask/core/pull/6528))
- Bump `@metamask/base-controller` from `^8.2.0` to `^8.3.0` ([#6465](https://github.com/MetaMask/core/pull/6465))

## [60.2.0]

### Added

- Add `isGasFeeIncluded` to `TransactionMeta`, `TransactionBatchRequest` and `addTransaction` options so the client can signal that MetaMask is compensated for the gas fee by the transaction ([#6428](https://github.com/MetaMask/core/pull/6428))
- Add optional `gasUsed` property to `TransactionMeta`, returned by the transaction simulation result ([#6410](https://github.com/MetaMask/core/pull/6410))

## [60.1.0]

### Added

- Add optional `batchTransactionsOptions` to `TransactionMeta` ([#6368](https://github.com/MetaMask/core/pull/6368))
  - Add optional `isAfter` property to `batchTransactions` entries in `TransactionMeta`.
  - Add `BatchTransaction` type.
- Add optional `metamaskPay` and `requiredTransactionIds` properties to `TransactionMeta` ([#6361](https://github.com/MetaMask/core/pull/6361))
  - Add `updateRequiredTransactionIds` method.
- Add `getSimulationConfig` constructor property ([#6281](https://github.com/MetaMask/core/pull/6281))

### Changed

- Bump `@metamask/base-controller` from `^8.1.0` to `^8.2.0` ([#6355](https://github.com/MetaMask/core/pull/6355))

## [60.0.0]

### Added

- Add `isGasFeeSponsored` property to `TransactionMeta` type ([#6244](https://github.com/MetaMask/core/pull/6244))

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` from `^32.0.0` to `^33.0.0` ([#6345](https://github.com/MetaMask/core/pull/6345))
- Bump `@metamask/controller-utils` from `^11.11.0` to `^11.12.0` ([#6303](https://github.com/MetaMask/core/pull/6303))

## [59.2.0]

### Added

- Add optional `updateType` property to disable `type` update in `updateEditableParams` method ([#6289](https://github.com/MetaMask/core/pull/6289))
- Add `perpsDeposit` to `TransactionType` ([#6282](https://github.com/MetaMask/core/pull/6282))

### Changed

- Bump `@metamask/base-controller` from `^8.0.1` to `^8.1.0` ([#6284](https://github.com/MetaMask/core/pull/6284))

## [59.1.0]

### Added

- Add `assetsFiatValues` property on `addTransaction` options ([#6178](https://github.com/MetaMask/core/pull/6178))
  - `assetsFiatValues.sending` is total fiat value of sent assets
  - `assetsFiatValues.receiving` is total fiat value of recieved assets
- Add and export `AddTransactionOptions` type ([#6178](https://github.com/MetaMask/core/pull/6178))

### Fixed

- Preserve provided `origin` in `transactions` when calling `addTransactionBatch` ([#6178](https://github.com/MetaMask/core/pull/6178))

## [59.0.0]

### Added

- Add fallback to the sequential hook when `publishBatchHook` returns empty ([#6063](https://github.com/MetaMask/core/pull/6063))

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` to `^32.0.0` ([#6171](https://github.com/MetaMask/core/pull/6171))

### Fixed

- Preserve provided `type` in `transactions` when calling `addTransactionBatch` ([#6056](https://github.com/MetaMask/core/pull/6056))
- Normalize transaction `data` to ensure case-insensitive detection ([#6102](https://github.com/MetaMask/core/pull/6102))

## [58.1.1]

### Changed

- Bump `@metamask/controller-utils` from `^11.10.0` to `^11.11.0` ([#6069](https://github.com/MetaMask/core/pull/6069))
  - This upgrade includes performance improvements to checksum hex address normalization
- Bump `@metamask/utils` from `^11.2.0` to `^11.4.2` ([#6054](https://github.com/MetaMask/core/pull/6054))

## [58.1.0]

### Added

- Support `containerTypes` property in `updateEditableParams` method ([#6014](https://github.com/MetaMask/core/pull/6014))
- Add specific transaction types to outgoing transactions retrieved from accounts API ([#5987](https://github.com/MetaMask/core/pull/5987))
  - Add optional `amount` property to `transferInformation` object in `TransactionMeta` type.

### Changed

- Automatically update `gasFeeEstimates` in unapproved `transactionBatches` ([#5950](https://github.com/MetaMask/core/pull/5950))
- Estimate gas for type-4 transactions with `data` using `eth_estimateGas` and state overrides if simulation fails [#6016](https://github.com/MetaMask/core/pull/6016))
- Query only latest page of transactions from accounts API ([#5983](https://github.com/MetaMask/core/pull/5983))
- Remove incoming transactions when calling `wipeTransactions` ([#5986](https://github.com/MetaMask/core/pull/5986))
- Poll immediately when calling `startIncomingTransactionPolling` ([#5986](https://github.com/MetaMask/core/pull/5986))

## [58.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` to `^31.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))
- **BREAKING:** Bump peer dependency `@metamask/gas-fee-controller` to `^24.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))
- **BREAKING:** Bump peer dependency `@metamask/network-controller` to `^24.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))

## [57.4.0]

### Added

- Add optional `afterSimulate` and `beforeSign` hooks to constructor ([#5503](https://github.com/MetaMask/core/pull/5503))
  - Add `AfterSimulateHook` type.
  - Add `BeforeSignHook` type.
  - Add `TransactionContainerType` enum.
  - Add `TransactionControllerEstimateGasAction` type.
  - Add optional `containerTypes` property to `TransactionMeta`.
  - Add optional `ignoreDelegationSignatures` boolean to `estimateGas` method.
- Add `gasFeeEstimates` property to `TransactionBatchMeta`, populated using `DefaultGasFeeFlow` ([#5886](https://github.com/MetaMask/core/pull/5886))

### Fixed

- Handle unknown chain IDs on incoming transactions ([#5985](https://github.com/MetaMask/core/pull/5985))

## [57.3.0]

### Added

- Add `SEI` network support ([#5694](https://github.com/MetaMask/core/pull/5694))
  - Add account address relationship API support
  - Add incoming transactions API support

## [57.2.0]

### Added

- Add `lendingWithdraw` to `TransactionType` ([#5936](https://github.com/MetaMask/core/pull/5936))

### Changed

- Bump `@metamask/controller-utils` to `^11.10.0` ([#5935](https://github.com/MetaMask/core/pull/5935))

### Fixed

- Avoid coercing `publishBatchHook` to a boolean ([#5934](https://github.com/MetaMask/core/pull/5934))

## [57.1.0]

### Added

- Add `gas` property to `TransactionBatchMeta`, populated using simulation API ([#5852](https://github.com/MetaMask/core/pull/5852))

### Changed

- Include gas limit and gas fees in simulation requests ([#5754](https://github.com/MetaMask/core/pull/5754))
  - Add optional `fee` property to `GasFeeToken`.
- Default addTransactionBatch to EIP7702 if supported, otherwise use sequential batch ([#5853](https://github.com/MetaMask/core/pull/5853))

## [57.0.0]

### Changed

- **BREAKING:** bump `@metamask/accounts-controller` peer dependency to `^30.0.0` ([#5888](https://github.com/MetaMask/core/pull/5888))

## [56.3.0]

### Added

- Include `origin` for `wallet_sendCalls` requests to the security alerts API ([#5876](https://github.com/MetaMask/core/pull/5876))
  - Extend `ValidateSecurityRequest` with `origin` property.
  - Send `origin` via `validateSecurity` callback.
- Add optional approval request when calling `addTransactionBatch` ([#5793](https://github.com/MetaMask/core/pull/5793))
  - Add `transactionBatches` array to state.
  - Add `TransactionBatchMeta` type.

### Fixed

- Support leading zeroes in `authorizationList` properties ([#5830](https://github.com/MetaMask/core/pull/5830))

## [56.2.0]

### Added

- Add sequential batch support when `publishBatchHook` is not defined ([#5762](https://github.com/MetaMask/core/pull/5762))

### Fixed

- Fix `userFeeLevel` as `dappSuggested` initially when dApp suggested gas values for legacy transactions ([#5821](https://github.com/MetaMask/core/pull/5821))
- Fix `addTransaction` function to correctly identify a transaction as a `simpleSend` type when the recipient is a smart account ([#5822](https://github.com/MetaMask/core/pull/5822))
- Fix gas fee randomisation with many decimal places ([#5839](https://github.com/MetaMask/core/pull/5839))

## [56.1.0]

### Added

- Automatically update gas fee properties in `txParams` when `updateTransactionGasFees` method is called with `userFeeLevel` ([#5800](https://github.com/MetaMask/core/pull/5800))
- Support additional debug of incoming transaction requests ([#5803](https://github.com/MetaMask/core/pull/5803))
  - Add optional `incomingTransactions.client` constructor property.
  - Add optional `tags` property to `updateIncomingTransactions` method.

### Changed

- Bump `@metamask/controller-utils` to `^11.9.0` ([#5812](https://github.com/MetaMask/core/pull/5812))

### Fixed

- Throw correct error code if upgrade rejected ([#5814](https://github.com/MetaMask/core/pull/5814))

## [56.0.0]

### Changed

- **BREAKING:** bump `@metamask/accounts-controller` peer dependency to `^29.0.0` ([#5802](https://github.com/MetaMask/core/pull/5802))
- Configure incoming transaction polling interval using feature flag ([#5792](https://github.com/MetaMask/core/pull/5792))

## [55.0.2]

### Fixed

- Fix type-4 gas estimation ([#5790](https://github.com/MetaMask/core/pull/5790))

## [55.0.1]

### Changed

- Bump `@metamask/controller-utils` to `^11.8.0` ([#5765](https://github.com/MetaMask/core/pull/5765))

### Fixed

- Validate correct origin in EIP-7702 transaction ([#5771](https://github.com/MetaMask/core/pull/5771))
- Set `userFeeLevel` to `medium` instead of `dappSuggested` when `gasPrice` is suggested ([#5773](https://github.com/MetaMask/core/5773))

## [55.0.0]

### Added

- Add optional `isEIP7702GasFeeTokensEnabled` constructor callback ([#5706](https://github.com/MetaMask/core/pull/5706))
- Add `lendingDeposit` `TransactionType` ([#5747](https://github.com/MetaMask/core/pull/5747))

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency to `^28.0.0` ([#5763](https://github.com/MetaMask/core/pull/5763))

## [54.4.0]

### Changed

- Bump `@metamask/network-controller` from `^23.2.0` to `^23.3.0` ([#5729](https://github.com/MetaMask/core/pull/5729))
- Remove validation of `from` if `origin` is internal ([#5707](https://github.com/MetaMask/core/pull/5707))

## [54.3.0]

### Added

- Add optional `gasTransfer` property to `GasFeeToken` ([#5681](https://github.com/MetaMask/core/pull/5681))

### Changed

- Bump `@metamask/base-controller` from ^8.0.0 to ^8.0.1 ([#5722](https://github.com/MetaMask/core/pull/5722))

## [54.2.0]

### Added

- Add optional `afterAdd` hook to constructor ([#5692](https://github.com/MetaMask/core/pull/5692))
  - Add optional `txParamsOriginal` property to `TransactionMeta`.
  - Add `AfterAddHook` type.

### Fixed

- Handle errors in `isAtomicBatchSupported` method ([#5704](https://github.com/MetaMask/core/pull/5704))

## [54.1.0]

### Changed

- Configure gas estimation buffers using feature flags ([#5637](https://github.com/MetaMask/core/pull/5637))
- Update error codes for duplicate batch ID and batch size limit errors ([#5635](https://github.com/MetaMask/core/pull/5635))

### Fixed

- Do not use fixed gas for type 4 transactions ([#5646](https://github.com/MetaMask/core/pull/5646))
- Throw if `addTransactionBatch` is called with any nested transaction with `to` matching internal account and including `data` ([#5635](https://github.com/MetaMask/core/pull/5635))
- Fix incoming transaction support with `queryEntireHistory` set to `false` ([#5582](https://github.com/MetaMask/core/pull/5582))

## [54.0.0]

### Added

- Add `isExternalSign` property to `TransactionMeta` to disable nonce generation and signing ([#5604](https://github.com/MetaMask/core/pull/5604))
- Add types for `isAtomicBatchSupported` method ([#5600](https://github.com/MetaMask/core/pull/5600))
  - `IsAtomicBatchSupportedRequest`
  - `IsAtomicBatchSupportedResult`
  - `IsAtomicBatchSupportedResultEntry`

### Changed

- **BREAKING:** Update signature of `isAtomicBatchSupported` method ([#5600](https://github.com/MetaMask/core/pull/5600))
  - Replace `address` argument with `request` object containing `address` and optional `chainIds`.
  - Return array of `IsAtomicBatchSupportedResultEntry` objects.
- Skip `origin` validation for `batch` transaction type ([#5586](https://github.com/MetaMask/core/pull/5586))

### Fixed

- **BREAKING:** `enableTxParamsGasFeeUpdates` is renamed to `isAutomaticGasFeeUpdateEnabled` now expects a callback function instead of a boolean. ([#5602](https://github.com/MetaMask/core/pull/5602))
  - This callback is invoked before performing `txParams` gas fee updates. The update will proceed only if the callback returns a truthy value.
  - If not set it will default to return `false`.

## [53.0.0]

### Added

- Add `gasPayment` to `TransactionType` enum ([#5584](https://github.com/MetaMask/core/pull/5584))
- Add `TransactionControllerUpdateCustodialTransactionAction` messenger action ([#5045](https://github.com/MetaMask/core/pull/5045))

### Changed

- **BREAKING:** Return `Promise` from `beforePublish` and `beforeCheckPendingTransaction` hooks ([#5045](https://github.com/MetaMask/core/pull/5045))
- Support additional parameters in `updateCustodialTransaction` method ([#5045](https://github.com/MetaMask/core/pull/5045))
  - `gasLimit`
  - `gasPrice`
  - `maxFeePerGas`
  - `maxPriorityFeePerGas`
  - `nonce`
  - `type`
- Configure gas estimation fallback using remote feature flags ([#5556](https://github.com/MetaMask/core/pull/5556))
- Throw if `chainId` in `TransactionParams` does not match `networkClientId` when calling `addTransaction` ([#5511](https://github.com/MetaMask/core/pull/5569))
  - Mark `chainId` in `TransactionParams` as deprecated.
- Bump `@metamask/controller-utils` to `^11.7.0` ([#5583](https://github.com/MetaMask/core/pull/5583))

### Removed

- **BREAKING:** Remove `custodyId` and `custodyStatus` properties from `TransactionMeta` ([#5045](https://github.com/MetaMask/core/pull/5045))

## [52.3.0]

### Added

- Adds `RandomisedEstimationsGasFeeFlow` to gas fee flows in `TransactionController` ([#5511](https://github.com/MetaMask/core/pull/5511))
  - Added flow only will be activated if chainId is defined in feature flags.
- Configure pending transaction polling intervals using remote feature flags ([#5549](https://github.com/MetaMask/core/pull/5549))

### Fixed

- Fix EIP-7702 contract signature validation on chains with odd-length hexadecimal ID ([#5563](https://github.com/MetaMask/core/pull/5563))
- Fix simulation of type-4 transactions ([#5552](https://github.com/MetaMask/core/pull/5552))
- Display incoming transactions in active tab ([#5487](https://github.com/MetaMask/core/pull/5487))
- Fix bug in `updateTransactionGasFees` affecting `txParams` gas updates when `enableTxParamsGasFeeUpdates` is enabled. ([#5539](https://github.com/MetaMask/core/pull/5539))

## [52.2.0]

### Added

- Add `gasFeeTokens` to `TransactionMeta` ([#5524](https://github.com/MetaMask/core/pull/5524))
  - Add `GasFeeToken` type.
  - Add `selectedGasFeeToken` to `TransactionMeta`.
  - Add `updateSelectedGasFeeToken` method.
- Support security validation of transaction batches ([#5526](https://github.com/MetaMask/core/pull/5526))
  - Add `ValidateSecurityRequest` type.
  - Add optional `securityAlertId` to `SecurityAlertResponse`.
  - Add optional `securityAlertId` to `TransactionBatchRequest`.
  - Add optional `validateSecurity` callback to `TransactionBatchRequest`.
- Support publish batch hook ([#5401](https://github.com/MetaMask/core/pull/5401))
  - Add `hooks.publishBatch` option to constructor.
  - Add `updateBatchTransactions` method.
  - Add `maxFeePerGas` and `maxPriorityFeePerGas` to `updateEditableParams` options.
  - Add types.
    - `PublishBatchHook`
    - `PublishBatchHookRequest`
    - `PublishBatchHookResult`
    - `PublishBatchHookTransaction`
    - `PublishHook`
    - `PublishHookResult`
  - Add optional properties to `TransactionMeta`.
    - `batchTransactions`
    - `disableGasBuffer`
  - Add optional properties to `BatchTransactionParams`.
    - `gas`
    - `maxFeePerGas`
    - `maxPriorityFeePerGas`
  - Add optional `existingTransaction` property to `TransactionBatchSingleRequest`.
  - Add optional `useHook` property to `TransactionBatchRequest`.

## [52.1.0]

### Added

- Add `enableTxParamsGasFeeUpdates` constructor option ([5394](https://github.com/MetaMask/core/pull/5394))
  - If not set it will default to `false`.
  - Automatically update gas fee properties in `txParams` when the `gasFeeEstimates` are updated via polling.

### Fixed

- Fix gas estimation for type 4 transactions ([#5519](https://github.com/MetaMask/core/pull/5519))

## [52.0.0]

### Changed

- **BREAKING:** Remove `chainIds` argument from incoming transaction methods ([#5436](https://github.com/MetaMask/core/pull/5436))
  - `startIncomingTransactionPolling`
  - `stopIncomingTransactionPolling`
  - `updateIncomingTransactions`

## [51.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` to `^27.0.0` ([#5507](https://github.com/MetaMask/core/pull/5507))
- **BREAKING:** Bump peer dependency `@metamask/gas-fee-controller` to `^23.0.0` ([#5507](https://github.com/MetaMask/core/pull/5507))
- **BREAKING:** Bump peer dependency `@metamask/network-controller` to `^23.0.0` ([#5507](https://github.com/MetaMask/core/pull/5507))

## [50.0.0]

### Added

- Add additional metadata for batch metrics ([#5488](https://github.com/MetaMask/core/pull/5488))
  - Add `delegationAddress` to `TransactionMeta`.
  - Add `NestedTransactionMetadata` type containing `BatchTransactionParams` and `type`.
  - Add optional `type` to `TransactionBatchSingleRequest`.
- Verify EIP-7702 contract address using signatures ([#5472](https://github.com/MetaMask/core/pull/5472))
  - Add optional `publicKeyEIP7702` property to constructor.
  - Add dependency on `^5.7.0` of `@ethersproject/wallet`.

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency to `^26.1.0` ([#5481](https://github.com/MetaMask/core/pull/5481))
- **BREAKING:** Add additional metadata for batch metrics ([#5488](https://github.com/MetaMask/core/pull/5488))
  - Change `error` in `TransactionMeta` to optional for all statuses.
  - Change `nestedTransactions` in `TransactionMeta` to array of `NestedTransactionMetadata`.
- Throw if `addTransactionBatch` called with external origin and size limit exceeded ([#5489](https://github.com/MetaMask/core/pull/5489))
- Verify EIP-7702 contract address using signatures ([#5472](https://github.com/MetaMask/core/pull/5472))
  - Use new `contracts` property from feature flags instead of `contractAddresses`.

## [49.0.0]

### Added

- Add `revertDelegation` to `TransactionType` ([#5468](https://github.com/MetaMask/core/pull/5468))
- Add optional batch ID to metadata ([#5462](https://github.com/MetaMask/core/pull/5462))
  - Add optional `batchId` property to `TransactionMeta`.
  - Add optional `transactionHash` to `TransactionReceipt`.
  - Add optional `data` to `Log`.
  - Add optional `batchId` to `TransactionBatchRequest`.
  - Add optional `batchId` to `addTransaction` options.
  - Throw if `batchId` already exists on a transaction.

### Changed

- **BREAKING:** Add optional batch ID to metadata ([#5462](https://github.com/MetaMask/core/pull/5462))
  - Change `batchId` in `TransactionBatchResult` to `Hex`.
  - Return `batchId` from `addTransactionBatch` if provided.
  - Generate random batch ID if no `batchId` provided.

## [48.2.0]

### Changed

- Normalize gas limit using `gas` and `gasLimit` properties ([#5396](https://github.com/MetaMask/core/pull/5396))

## [48.1.0]

### Changed

- Prevent external transactions to internal accounts if `data` included ([#5418](https://github.com/MetaMask/core/pull/5418))

## [48.0.0]

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency to `^26.0.0` ([#5439](https://github.com/MetaMask/core/pull/5439))
- **BREAKING:** Bump `@ethereumjs/util` from `^8.1.0` to `^9.1.0` ([#5347](https://github.com/MetaMask/core/pull/5347))

## [47.0.0]

### Added

- Persist user rejection optional data in rejected error ([#5355](https://github.com/MetaMask/core/pull/5355))
- Add `updateAtomicBatchData` method ([#5380](https://github.com/MetaMask/core/pull/5380))
- Support atomic batch transactions ([#5306](https://github.com/MetaMask/core/pull/5306))
  - Add methods:
    - `addTransactionBatch`
    - `isAtomicBatchSupported`
  - Add `batch` to `TransactionType`.
  - Add `nestedTransactions` to `TransactionMeta`.
  - Add new types:
    - `BatchTransactionParams`
    - `TransactionBatchSingleRequest`
    - `TransactionBatchRequest`
    - `TransactionBatchResult`
  - Add dependency on `@metamask/remote-feature-flag-controller:^1.4.0`.

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency to `^25.0.0` ([#5426](https://github.com/MetaMask/core/pull/5426))
- **BREAKING**: Require messenger permissions for `KeyringController:signEip7702Authorization` action ([#5410](https://github.com/MetaMask/core/pull/5410))
- **BREAKING:** Support atomic batch transactions ([#5306](https://github.com/MetaMask/core/pull/5306))
  - Require `AccountsController:getState` action permission in messenger.
  - Require `RemoteFeatureFlagController:getState` action permission in messenger.
- Bump `@metamask/utils` from `^11.1.0` to `^11.2.0` ([#5301](https://github.com/MetaMask/core/pull/5301))
- Throw if `addTransactionBatch` is called with any nested transaction with `to` matching internal account ([#5369](https://github.com/MetaMask/core/pull/5369))

## [46.0.0]

### Added

- Adds ability of re-simulating transaction depending on the `isActive` property on `transactionMeta` ([#5189](https://github.com/MetaMask/core/pull/5189))
  - `isActive` property is expected to set by client.
  - Re-simulation of transactions will occur every 3 seconds if `isActive` is `true`.
- Adds `setTransactionActive` function to update the `isActive` property on `transactionMeta`. ([#5189](https://github.com/MetaMask/core/pull/5189))

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency from `^23.0.0` to `^24.0.0` ([#5318](https://github.com/MetaMask/core/pull/5318))

## [45.1.0]

### Added

- Add support for EIP-7702 / type 4 transactions ([#5285](https://github.com/MetaMask/core/pull/5285))
  - Add `setCode` to `TransactionEnvelopeType`.
  - Add `authorizationList` to `TransactionParams`.
  - Export `Authorization` and `AuthorizationList` types.

### Changed

- The TransactionController messenger must now allow the `KeyringController:signAuthorization` action ([#5285](https://github.com/MetaMask/core/pull/5285))
- Bump `@metamask/base-controller` from `^7.1.1` to `^8.0.0` ([#5305](https://github.com/MetaMask/core/pull/5305))
- Bump `ethereumjs/tx` from `^4.2.0` to `^5.4.0` ([#5285](https://github.com/MetaMask/core/pull/5285))
- Bump `ethereumjs/common` from `^3.2.0` to `^4.5.0` ([#5285](https://github.com/MetaMask/core/pull/5285))

## [45.0.0]

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency from `^22.0.0` to `^23.0.0` ([#5292](https://github.com/MetaMask/core/pull/5292))

## [44.1.0]

### Changed

- Rename `ControllerMessenger` to `Messenger` ([#5234](https://github.com/MetaMask/core/pull/5234))
- Bump `@metamask/utils` from `^11.0.1` to `^11.1.0` ([#5223](https://github.com/MetaMask/core/pull/5223))

### Fixed

- Prevent transaction resubmit on multiple endpoints ([#5262](https://github.com/MetaMask/core/pull/5262))

## [44.0.0]

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency from `^21.0.0` to `^22.0.0` ([#5218](https://github.com/MetaMask/core/pull/5218))

## [43.0.0]

### Added

- Add `gasLimitNoBuffer` property to `TransactionMeta` type ([#5113](https://github.com/MetaMask/core/pull/5113))
  - `gasLimitNoBuffer` is the estimated gas for the transaction without any buffer applied.

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency from `^20.0.0` to `^21.0.0` ([#5140](https://github.com/MetaMask/core/pull/5140))
- Bump `@metamask/base-controller` from `7.1.0` to `^7.1.1` ([#5135](https://github.com/MetaMask/core/pull/5135))

## [42.1.0]

### Added

- Validate `gas` and `gasLimit` are hexadecimal strings ([#5093](https://github.com/MetaMask/core/pull/5093))

### Changed

- Bump `@metamask/base-controller` from `^7.0.0` to `^7.1.0` ([#5079](https://github.com/MetaMask/core/pull/5079))
- Bump `@metamask/utils` to `^11.0.1` and `@metamask/rpc-errors` to `^7.0.2` ([#5080](https://github.com/MetaMask/core/pull/5080))

## [42.0.0]

### Added

- Retrieve incoming transactions using Accounts API ([#4927](https://github.com/MetaMask/core/pull/4927))
  - Add `INCOMING_TRANSACTIONS_SUPPORTED_CHAIN_IDS` constant.

### Changed

- **BREAKING:** Retrieve incoming transactions using Accounts API ([#4927](https://github.com/MetaMask/core/pull/4927))
  - Rename `TransactionControllerIncomingTransactionBlockReceivedEvent` to `TransactionControllerIncomingTransactionsReceivedEvent`.
  - Replace `networkClientIds` argument with `chainIds` in following methods:
    - `startIncomingTransactionPolling`
    - `stopIncomingTransactionPolling`
    - `updateIncomingTransactions`
- Bump `@metamask/eth-block-tracker` from `^11.0.2` to `^11.0.3` ([#5025](https://github.com/MetaMask/core/pull/5025))

### Removed

- **BREAKING:** Retrieve incoming transactions using Accounts API ([#4927](https://github.com/MetaMask/core/pull/4927))
  - Remove `ETHERSCAN_SUPPORTED_NETWORKS` constant.
  - Remove types:
    - `EtherscanTransactionMeta`
    - `RemoteTransactionSource`
    - `RemoteTransactionSourceRequest`

## [41.1.0]

### Added

- Add optional `destinationChainId` property to `TransactionMeta` to facilitate Bridge transactions ([#4988](https://github.com/MetaMask/core/pull/4988))

### Changed

- Bump `@metamask/controller-utils` from `^11.4.3` to `^11.4.4` ([#5012](https://github.com/MetaMask/core/pull/5012))

### Fixed

- Make implicit peer dependencies explicit ([#4974](https://github.com/MetaMask/core/pull/4974))
  - Add the following packages as peer dependencies of this package to satisfy peer dependency requirements from other dependencies:
    - `@babel/runtime` `^7.0.0` (required by `@metamask/ethjs-provider-http`)
    - `@metamask/eth-block-tracker` `>=9` (required by `@metamask/nonce-tracker`)
  - These dependencies really should be present in projects that consume this package (e.g. MetaMask clients), and this change ensures that they now are.
  - Furthermore, we are assuming that clients already use these dependencies, since otherwise it would be impossible to consume this package in its entirety or even create a working build. Hence, the addition of these peer dependencies is really a formality and should not be breaking.
- Correct ESM-compatible build so that imports of the following packages that re-export other modules via `export *` are no longer corrupted: ([#5011](https://github.com/MetaMask/core/pull/5011))
  - `@ethereumjs/common`
  - `@ethereumjs/util`
  - `@metamask/eth-query`
  - `bn.js`
  - `fast-json-patch`
  - `lodash`

## [41.0.0]

### Added

- **BREAKING:** Remove global network usage ([#4920](https://github.com/MetaMask/core/pull/4920))
  - Add required `networkClientId` argument to `handleMethodData` method.

### Changed

- **BREAKING:** Remove global network usage ([#4920](https://github.com/MetaMask/core/pull/4920))
  - Require `networkClientId` option in `addTransaction` method.
  - Require `networkClientId` property in `TransactionMeta` type.
  - Change `wipeTransactions` method arguments to optional object containing `address` and `chainId` properties.
  - Require `networkClientId` argument in `estimateGas`, `estimateGasBuffered` and `getNonceLock` methods.

### Removed

- **BREAKING:** Remove global network usage ([#4920](https://github.com/MetaMask/core/pull/4920))
  - Remove the `blockTracker`, `isMultichainEnabled`, `onNetworkStateChange` and `provider` constructor options.
  - Remove `filterToCurrentNetwork` option from `getTransactions` method.

## [40.1.0]

### Added

- Add `firstTimeInteraction` to transaction meta ([#4895](https://github.com/MetaMask/core/pull/4895))
  - This is a boolean value that indicates whether the transaction is the first time the user has interacted with it.
- Add `isFirstTimeInteractionEnabled` callback constructor option ([#4895](https://github.com/MetaMask/core/pull/4895))
  - This is a function that returns a boolean value indicating whether the first time interaction check should be enabled.

## [40.0.0]

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency from `^19.0.0` to `^20.0.0` ([#4195](https://github.com/MetaMask/core/pull/4956))

## [39.1.0]

### Changed

- Temporarily increase the pending transaction polling rate when polling starts ([#4917](https://github.com/MetaMask/core/pull/4917))
  - Poll every 3 seconds up to ten times, then poll on each new block.

## [39.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` from `^18.0.0` to `^19.0.0` ([#4915](https://github.com/MetaMask/core/pull/4915))
- Bump `@metamask/controller-utils` from `^11.4.2` to `^11.4.3` ([#4915](https://github.com/MetaMask/core/pull/4915))

## [38.3.0]

### Added

- Validate gas fee properties to ensure they are valid hexadecimal strings ([#4854](https://github.com/MetaMask/core/pull/4854))

### Fixed

- Fix gas limit estimation on new transactions and via `estimateGas` and `estimateGasBuffered` methods ([#4897](https://github.com/MetaMask/core/pull/4897))

## [38.2.0]

### Added

- Add staking transaction types ([#4874](https://github.com/MetaMask/core/pull/4874))
  - `stakingClaim`
  - `stakingDeposit`
  - `stakingUnstake`

### Changed

- Bump `@metamask/controller-utils` from `^11.4.1` to `^11.4.2` ([#4870](https://github.com/MetaMask/core/pull/4870))
- Bump `@metamask/accounts-controller` from `^18.2.2` to `^18.2.3` ([#4870](https://github.com/MetaMask/core/pull/4870))
- Bump `@metamask/network-controller` from `^22.0.0` to `^22.0.1` ([#4870](https://github.com/MetaMask/core/pull/4870))

## [38.1.0]

### Added

- Automatically re-simulate transactions based on security criteria ([#4792](https://github.com/MetaMask/core/pull/4792))
  - If the security provider marks the transaction as malicious.
  - If the simulated native balance change does not match the `value`.
  - Set new `isUpdatedAfterSecurityCheck` property to `true` if the subsequent simulation response has changed.

### Changed

- Bump `@metamask/eth-json-rpc-provider` from `^4.1.5` to `^4.1.6` ([#4862](https://github.com/MetaMask/core/pull/4862))
- Bump `@metamask/approval-controller` from `^7.1.0` to `^7.1.1` ([#4862](https://github.com/MetaMask/core/pull/4862))
- Bump `@metamask/controller-utils` from `^11.4.0` to `^11.4.1` ([#4862](https://github.com/MetaMask/core/pull/4862))
- Bump `@metamask/base-controller` from `7.0.1` to `^7.0.2` ([#4862](https://github.com/MetaMask/core/pull/4862))

## [38.0.0]

### Changed

- **BREAKING:** Bump `@metamask/gas-fee-controller` peer dependency from `^20.0.0` to `^21.0.0` ([#4810](https://github.com/MetaMask/core/pull/4810))
- **BREAKING:** Bump `@metamask/network-controller` peer dependency from `^21.0.0` to `^22.0.0` ([#4841](https://github.com/MetaMask/core/pull/4841))
- Bump `@metamask/controller-utils` to `^11.4.0` ([#4834](https://github.com/MetaMask/core/pull/4834))
- Bump `@metamask/rpc-errors` to `^7.0.1` ([#4831](https://github.com/MetaMask/core/pull/4831))
- Bump `@metamask/utils` to `^10.0.0` ([#4831](https://github.com/MetaMask/core/pull/4831))

## [37.3.0]

### Added

- Add types for bridge transactions ([#4714](https://github.com/MetaMask/core/pull/4714))

### Changed

- Reduce gas limit fallback from 95% to 35% of the block gas limit on failed gas limit estimations ([#4739](https://github.com/MetaMask/core/pull/4739))

### Fixed

- Use contract ABIs to decode the token balance responses ([#4775](https://github.com/MetaMask/core/pull/4775))

## [37.2.0]

### Added

- Add optional `incomingTransactions.etherscanApiKeysByChainId` constructor property to support API keys in requests to Etherscan ([#4748](https://github.com/MetaMask/core/pull/4748))

### Fixed

- Cleanup transactions only during initialisation ([#4753](https://github.com/MetaMask/core/pull/4753))
- Remove `gasPrice` from requests to `linea_estimateGas` ([#4737](https://github.com/MetaMask/core/pull/4737))

## [37.1.0]

### Added

- Populate `submitHistory` in state when submitting transactions to network ([#4706](https://github.com/MetaMask/core/pull/4706))
- Export `CHAIN_IDS`, `ETHERSCAN_SUPPORTED_NETWORKS` and `SPEED_UP_RATE` constants ([#4706](https://github.com/MetaMask/core/pull/4706))

### Changed

- Make `getPermittedAccounts` constructor callback optional ([#4706](https://github.com/MetaMask/core/pull/4706))
- Bump accounts related packages ([#4713](https://github.com/MetaMask/core/pull/4713)), ([#4728](https://github.com/MetaMask/core/pull/4728))
  - Those packages are now built slightly differently and are part of the [accounts monorepo](https://github.com/MetaMask/accounts).
  - Bump `@metamask/keyring-api` from `^8.1.0` to `^8.1.4`

## [37.0.0]

### Changed

- Remove unapproved transactions during initialisation ([#4658](https://github.com/MetaMask/core/pull/4658))
- Fail approved and signed transactions during initialisation ([#4658](https://github.com/MetaMask/core/pull/4658))
- Remove `TraceContext`, `TraceRequest`, and `TraceCallback` types ([#4655](https://github.com/MetaMask/core/pull/4655))
  - These were moved to `@metamask/controller-utils`.

### Removed

- **BREAKING:** Remove `initApprovals` method ([#4658](https://github.com/MetaMask/core/pull/4658))
- **BREAKING:** Remove `beforeApproveOnInit` hook ([#4658](https://github.com/MetaMask/core/pull/4658))

### Fixed

- Produce and export ESM-compatible TypeScript type declaration files in addition to CommonJS-compatible declaration files ([#4648](https://github.com/MetaMask/core/pull/4648))
  - Previously, this package shipped with only one variant of type declaration
    files, and these files were only CommonJS-compatible, and the `exports`
    field in `package.json` linked to these files. This is an anti-pattern and
    was rightfully flagged by the
    ["Are the Types Wrong?"](https://arethetypeswrong.github.io/) tool as
    ["masquerading as CJS"](https://github.com/arethetypeswrong/arethetypeswrong.github.io/blob/main/docs/problems/FalseCJS.md).
    All of the ATTW checks now pass.
- Remove chunk files ([#4648](https://github.com/MetaMask/core/pull/4648)).
  - Previously, the build tool we used to generate JavaScript files extracted
    common code to "chunk" files. While this was intended to make this package
    more tree-shakeable, it also made debugging more difficult for our
    development teams. These chunk files are no longer present.

## [36.1.0]

### Added

- Add missing `TransactionControllerOptions` type in package-level export ([#4683](https://github.com/MetaMask/core/pull/4683))

## [36.0.0]

### Changed

- **BREAKING:** Bump devDependency and peerDependency `@metamask/network-controller` from `^20.0.0` to `^21.0.0` ([#4651](https://github.com/MetaMask/core/pull/4651))
- **BREAKING:** Bump devDependency and peerDependency `@metamask/gas-fee-controller` from `^19.0.0` to `^20.0.0` ( [#4651](https://github.com/MetaMask/core/pull/4651))
- Bump `@metamask/base-controller` from `^6.0.3` to `^7.0.0` ([#4643](https://github.com/MetaMask/core/pull/4643))
- Bump `@metamask/controller-utils` from `^11.0.2` to `^11.2.0` ([#4639](https://github.com/MetaMask/core/pull/4639), [#4651](https://github.com/MetaMask/core/pull/4651))

## [35.2.0]

### Added

- Add tracing infrastructure ([#4575](https://github.com/MetaMask/core/pull/4575))
  - Add optional `trace` callback to constructor.
  - Add optional `traceContext` option to `addTransaction` method.
  - Add initial tracing of transaction lifecycle.

### Changed

- Bump `@metamask/base-controller` from `^6.0.2` to `^6.0.3` ([#4625](https://github.com/MetaMask/core/pull/4625))
- Bump `@metamask/network-controller` from `^20.1.0` to `^20.2.0` ([#4618](https://github.com/MetaMask/core/pull/4618))
- Bump `@metamask/eth-json-rpc-provider` from `^4.1.2` to `^4.1.3` ([#4607](https://github.com/MetaMask/core/pull/4607))

### Removed

- Remove validation of `gasValues` passed to `speedUpTransaction` and `stopTransaction` methods ([#4617](https://github.com/MetaMask/core/pull/4617))

## [35.1.1]

### Changed

- Upgrade TypeScript version from `~5.0.4` to `~5.2.2` ([#4576](https://github.com/MetaMask/core/pull/4576), [#4584](https://github.com/MetaMask/core/pull/4584))

### Fixed

- Fix gaps in transaction validation and async error logging ([#4596](https://github.com/MetaMask/core/pull/4596))
- Upgrade `@metamask/nonce-tracker` from v5 to v6 ([#4591](https://github.com/MetaMask/core/pull/4591))

## [35.1.0]

### Added

- Add `DISPLAYED_TRANSACTION_HISTORY_PATHS` constant, representing the transaction history paths that may be used for display ([#4555](https://github.com/MetaMask/core/pull/4555))
  - This was exported so that it might be used to ensure display logic and internal history logic remains in-sync.
  - Any paths listed here will have their timestamps preserved. Unlisted paths may be compressed by the controller to minimize history size, losing the timestamp.
- Add `MAX_TRANSACTION_HISTORY_LENGTH` constant, representing the expected maximum size of the `history` property for a given transaction ([#4555](https://github.com/MetaMask/core/pull/4555))
  - Note that this is not strictly enforced, the length may exceed this number of all entries are "displayed" entries, but we expect this to be extremely improbable in practice.

### Fixed

- Prevent transaction history from growing endlessly in size ([#4555](https://github.com/MetaMask/core/pull/4555))

## [35.0.1]

### Changed

- **BREAKING:** Bump peerDependency `@metamask/accounts-controller` from `^17.0.0` to `^18.0.0` ([#4548](https://github.com/MetaMask/core/pull/4548))
- Remove `@metamask/accounts-controller`, `@metamask/approval-controller`, `@metamask/gas-fee-controller`, and `@metamask/network-controller` dependencies [#4556](https://github.com/MetaMask/core/pull/4556)
  - These were listed under `peerDependencies` already, so they were redundant as dependencies.
- Upgrade TypeScript version to `~5.0.4` and set `moduleResolution` option to `Node16` ([#3645](https://github.com/MetaMask/core/pull/3645))
- Bump `@metamask/base-controller` from `^6.0.0` to `^6.0.2` ([#4517](https://github.com/MetaMask/core/pull/4517), [#4544](https://github.com/MetaMask/core/pull/4544))
- Bump `@metamask/controller-utils` from `^11.0.0` to `^11.0.2` ([#4517](https://github.com/MetaMask/core/pull/4517), [#4544](https://github.com/MetaMask/core/pull/4544))
- Bump `@metamask/rpc-errors` from `^6.2.1` to `^6.3.1` ([#4516](https://github.com/MetaMask/core/pull/4516))
- Bump `@metamask/utils` from `^8.3.0` to `^9.1.0` ([#4516](https://github.com/MetaMask/core/pull/4516), [#4529](https://github.com/MetaMask/core/pull/4529))

### Fixed

- Fix simulation data parsing logic to avoid failed simulations creating `ApprovalForAll` events ([#4512](https://github.com/MetaMask/core/pull/4512))

## [35.0.0]

### Changed

- **BREAKING:** Bump peerDependency `@metamask/network-controller` to `^20.0.0` ([#4508](https://github.com/MetaMask/core/pull/4508))
- **BREAKING:** Bump peerDependency `@metamask/gas-fee-controller` to `^19.0.0` ([#4508](https://github.com/MetaMask/core/pull/4508))

## [34.0.0]

### Changed

- **BREAKING:** Bump dependency and peer dependency `@metamask/gas-fee-controller` to `^18.0.0` ([#4498](https://github.com/MetaMask/core/pull/4498))
- Bump dependency `@metamask/accounts-controller` to `^17.2.0` ([#4498](https://github.com/MetaMask/core/pull/4498))

## [33.0.1]

### Changed

- Document TransactionStatus enum ([#4380](https://github.com/MetaMask/core/pull/4380))
- Bump `@metamask/accounts-controller` to `^17.1.0` ([#4460](https://github.com/MetaMask/core/pull/4460))

## [33.0.0]

### Changed

- **BREAKING:** The `TransactionController` messenger must now allow the `AccountsController:getSelectedAccount` action ([#4244](https://github.com/MetaMask/core/pull/4244))
- **BREAKING:** `getCurrentAccount` returns an `InternalAccount` instead of a `string` in the `IncomingTransactionHelper` ([#4244](https://github.com/MetaMask/core/pull/4244))
- **BREAKING:** Bump dependency and peer dependency `@metamask/accounts-controller` to `^17.0.0` ([#4413](https://github.com/MetaMask/core/pull/4413))
- Bump `@metamask/eth-snap-keyring` to `^4.3.1` ([#4405](https://github.com/MetaMask/core/pull/4405))
- Bump `@metamask/keyring-api` to `^8.0.0` ([#4405](https://github.com/MetaMask/core/pull/4405))

### Removed

- **BREAKING:** Remove `getSelectedAddress` option from `TransactionController` ([#4244](https://github.com/MetaMask/core/pull/4244))
  - The AccountsController is used to get the currently selected address automatically.

### Fixed

- `MultichainTrackingHelper.getEthQuery` now returns global `ethQuery` with ([#4390](https://github.com/MetaMask/core/pull/4390))
- Support skipping updates to the simulation history for clients with disabled history ([#4349](https://github.com/MetaMask/core/pull/4349))

## [32.0.0]

### Changed

- **BREAKING:** Bump minimum Node version to 18.18 ([#3611](https://github.com/MetaMask/core/pull/3611))
- **BREAKING:** Bump dependency and peer dependency `@metamask/approval-controller` to `^7.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- **BREAKING:** Bump dependency and peer dependency `@metamask/gas-fee-controller` to `^17.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- **BREAKING:** Bump dependency and peer dependency `@metamask/network-controller` to `^19.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- Bump `@metamask/base-controller` to `^6.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- Bump `@metamask/controller-utils` to `^11.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))

## [31.0.0]

### Changed

- **BREAKING:** Bump dependency and peer dependency `@metamask/approval-controller` to `^6.0.2` ([#4342](https://github.com/MetaMask/core/pull/4342))
- **BREAKING:** Bump dependency and peer dependency `@metamask/gas-fee-controller` to `^16.0.0` ([#4342](https://github.com/MetaMask/core/pull/4342))
- **BREAKING:** Bump dependency and peer dependency `@metamask/network-controller` to `^18.1.3` ([#4342](https://github.com/MetaMask/core/pull/4342))
- Bump `async-mutex` to `^0.5.0` ([#4335](https://github.com/MetaMask/core/pull/4335))
- Bump `@metamask/controller-utils` to `^10.0.0` ([#4342](https://github.com/MetaMask/core/pull/4342))

### Removed

- **BREAKING:** Remove `sign` from `TransactionType` ([#4319](https://github.com/MetaMask/core/pull/4319))
  - This represented an `eth_sign` transaction, but support for that RPC method is being removed, so this is no longer needed.

### Fixed

- Pass an unfrozen transaction to the `afterSign` hook so that it is able to modify the transaction ([#4343](https://github.com/MetaMask/core/pull/4343))

## [30.0.0]

### Fixed

- **BREAKING**: Update from `nonce-tracker@^3.0.0` to `@metamask/nonce-tracker@^5.0.0` to mitigate issue with redundant polling loops in block tracker. ([#4309](https://github.com/MetaMask/core/pull/4309))
  - The constructor now expects the `blockTracker` option being an instance of `@metamask/eth-block-tracker` instead of`eth-block-tracker`.

## [29.1.0]

### Changed

- handle Swap+Send transactions as Swaps transactions sub-category; add typing ([#4298](https://github.com/MetaMask/core/pull/4298))

## [29.0.2]

### Fixed

- fix incorrect token balance changes for simulations of multiple tokens that include an NFT mint ([#4290](https://github.com/MetaMask/core/pull/4290))

## [29.0.1]

### Changed

- Bump `@metamask/gas-fee-controller` to `^15.1.2` ([#4275](https://github.com/MetaMask/core/pull/4275))

### Fixed

- approveTransaction was throwing away the raw signed transaction that signTransaction was adding to the metadata.
  This was causing some transaction with low gas to appear as "failed" when in fact they were still pending. ([#4255](https://github.com/MetaMask/core/pull/4255))

## [29.0.0]

### Added

- Add `estimateGasFee` method ([#4216](https://github.com/MetaMask/core/pull/4216))
  - Add `TestGasFeeFlow` that is activated by optional `testGasFeeFlows` constructor option.
  - Add related types:
    - `FeeMarketGasFeeEstimateForLevel`
    - `FeeMarketGasFeeEstimates`
    - `GasFeeEstimates`
    - `GasFeeEstimateLevel`
    - `GasFeeEstimateType`
    - `GasPriceGasFeeEstimates`
    - `LegacyGasFeeEstimates`

### Changed

- **BREAKING:** Update `GasFeeEstimates` type to support alternate estimate types ([#4216](https://github.com/MetaMask/core/pull/4216))
- Bump `@metamask/base-controller` to `^5.0.2` ([#4232](https://github.com/MetaMask/core/pull/4232))
- Bump `@metamask/approval-controller` to `^6.0.2` ([#4234](https://github.com/MetaMask/core/pull/4234))
- Bump `@metamask/gas-fee-controller` to `^15.1.1` ([#4234](https://github.com/MetaMask/core/pull/4234))

### Removed

- **BREAKING:** Remove `gasFeeControllerEstimateType` property from `mergeGasFeeEstimates` function ([#4216](https://github.com/MetaMask/core/pull/4216))

## [28.1.1]

### Changed

- Bump `@metamask/gas-fee-controller` to ^15.1.0 ([#4220](https://github.com/MetaMask/core/pull/4220))

### Fixed

- Fixed simulating minting NFTs where the nft owner was checked before minting, causing a revert. ([#4217](https://github.com/MetaMask/core/pull/4217))

## [28.1.0]

### Added

- Support retrieval of layer 1 gas fees on Scroll networks ([#4155](https://github.com/MetaMask/core/pull/4155))

## [28.0.0]

### Changed

- **BREAKING:** Change `getLayer1GasFee` arguments to a request object ([#4149](https://github.com/MetaMask/core/pull/4149))

### Fixed

- Fix automatic update of layer 1 gas fee after interval ([#4149](https://github.com/MetaMask/core/pull/4149))

## [27.0.1]

### Fixed

- Include wrapped ERC-20 and legacy ERC-721 tokens in simulation balance changes ([#4122](https://github.com/MetaMask/core/pull/4122))

## [27.0.0]

### Changed

- **BREAKING:** Change `pendingTransactions.isResubmitEnabled` from optional `boolean` to optional callback ([#4113](https://github.com/MetaMask/core/pull/4113))

### Fixed

- Check pending transactions on startup ([#4113](https://github.com/MetaMask/core/pull/4113))

## [26.0.0]

### Added

- Run `OptimismLayer1GasFeeFlow` on Optimism stack based transactions in order to add `layer1GasFee` property to transaction meta. ([#4055](https://github.com/MetaMask/core/pull/4055))
- Add `getLayer1GasFee` method to `TransactionController` to get the layer 1 gas fee for the given transaction params ([#4055](https://github.com/MetaMask/core/pull/4055))
- Add `SimulationErrorCode` enum ([#4106](https://github.com/MetaMask/core/pull/4106))

### Changed

- **BREAKING:** Bump peer dependency `@metamask/gas-fee-controller` to `^15.0.0` ([#4121](https://github.com/MetaMask/core/pull/4121))
- Update `addTransaction` to skip simulation if `requireApproval` is specified as `false` ([#4106](https://github.com/MetaMask/core/pull/4106))
- Provide simulation error code in locally generated errors (under the `code` property) ([#4106](https://github.com/MetaMask/core/pull/4106))
- Add dependency `@ethersproject/contracts` `^5.7.0` ([#4055](https://github.com/MetaMask/core/pull/4055))
- Add dependency `@ethersproject/providers` `^5.7.0` ([#4055](https://github.com/MetaMask/core/pull/4055))
- Bump dependency `@metamask/network-controller` to `^18.1.0` ([#4121](https://github.com/MetaMask/core/pull/4121))

### Removed

- **BREAKING**: Remove `isReverted` property from `SimulationError` type. ([#4106](https://github.com/MetaMask/core/pull/4106))

## [25.3.0]

### Added

- Add support for transactions with type `increaseAllowance` ([#4069](https://github.com/MetaMask/core/pull/4069))
  - Also add "increaseAllowance" to `TransactionType` under `tokenMethodIncreaseAllowance`

### Changed

- Bump `@metamask/metamask-eth-abis` to `^3.1.1` ([#4069](https://github.com/MetaMask/core/pull/4069))

### Fixed

- Provide updated transaction metadata to publish hook ([#4101](https://github.com/MetaMask/core/pull/4101))

## [25.2.1]

### Changed

- Bump `TypeScript` version to `~4.9.5` ([#4084](https://github.com/MetaMask/core/pull/4084))

### Fixed

- Emit finished event for custodial transactions when updating status to `submitted` or `failed` ([#4092](https://github.com/MetaMask/core/pull/4092))

## [25.2.0]

### Added

- Add simulation types ([#4067](https://github.com/MetaMask/core/pull/4067))
  - SimulationBalanceChange
  - SimulationData
  - SimulationError
  - SimulationToken
  - SimulationTokenBalanceChange
  - SimulationTokenStandard

### Changed

- No longer wait for simulation to complete before creating approval request ([#4067](https://github.com/MetaMask/core/pull/4067))
- Automatically update simulation data if transaction parameters are updated ([#4067](https://github.com/MetaMask/core/pull/4067))
- Determine networks supporting simulation dynamically using API ([#4087](https://github.com/MetaMask/core/pull/4087))

## [25.1.0]

### Added

- Support `Layer1GasFeeFlows` and add `layer1GasFee` property to `TransactionMeta` ([#3944](https://github.com/MetaMask/core/pull/3944))

### Fixed

- Fix `types` field in `package.json` ([#4047](https://github.com/MetaMask/core/pull/4047))

## [25.0.0]

### Added

- **BREAKING**: Add ESM build ([#3998](https://github.com/MetaMask/core/pull/3998))
  - It's no longer possible to import files from `./dist` directly.
- Add new types for TransactionController messenger actions ([#3827](https://github.com/MetaMask/core/pull/3827))
  - `TransactionControllerActions`
  - `TransactionControllerGetStateAction`
- Add new types for TransactionController messenger events ([#3827](https://github.com/MetaMask/core/pull/3827))
  - `TransactionControllerEvents`
  - `TransactionControllerIncomingTransactionBlockReceivedEvent`
  - `TransactionControllerPostTransactionBalanceUpdatedEvent`
  - `TransactionControllerSpeedupTransactionAddedEvent`
  - `TransactionControllerStateChangeEvent`
  - `TransactionControllerTransactionApprovedEvent`
  - `TransactionControllerTransactionConfirmedEvent`
  - `TransactionControllerTransactionDroppedEvent`
  - `TransactionControllerTransactionFailedEvent`
  - `TransactionControllerTransactionFinishedEvent`
  - `TransactionControllerTransactionNewSwapApprovalEvent`
  - `TransactionControllerTransactionNewSwapEvent`
  - `TransactionControllerTransactionPublishingSkipped`
  - `TransactionControllerTransactionRejectedEvent`
  - `TransactionControllerTransactionStatusUpdatedEvent`
  - `TransactionControllerTransactionSubmittedEvent`
  - `TransactionControllerUnapprovedTransactionAddedEvent`
- Add optional `simulationData` property to `TransactionMeta` which will be automatically populated ([#4020](https://github.com/MetaMask/core/pull/4020))
- Add optional `isSimulationEnabled` constructor option to dynamically disable simulation ([#4020](https://github.com/MetaMask/core/pull/4020))
- Add support for Linea Sepolia (chain ID `0xe705`) ([#3995](https://github.com/MetaMask/core/pull/3995))

### Changed

- **BREAKING:** Change superclass of TransactionController from BaseController v1 to BaseController v2 ([#3827](https://github.com/MetaMask/core/pull/3827))
  - Instead of accepting three arguments, the constructor now takes a single options argument. All of the existing options that were supported in the second argument are now a part of this options object, including `messenger`; `state` (the previous third argument) is also an option.
- **BREAKING:** Rename `txHistoryLimit` option to `transactionHistoryLimit` ([#3827](https://github.com/MetaMask/core/pull/3827))
- **BREAKING:** Switch some type definitions from `interface` to `type` ([#3827](https://github.com/MetaMask/core/pull/3827))
  - These types are affected:
    - `DappSuggestedGasFees`
    - `Log`
    - `MethodData`
    - `TransactionControllerState` (formerly `TransactionState`)
    - `TransactionParams`
    - `TransactionReceipt`
  - This is a breaking change because type aliases have different behavior from interfaces. Specifically, the `Json` type in `@metamask/utils`, which BaseController v2 controller state must conform to, is not compatible with interfaces.
- **BREAKING:** Align `parsedRegistryMethod` in `MethodData` type with usage ([#3827](https://github.com/MetaMask/core/pull/3827))
  - The type of this is now `{ name: string; args: { type: string }[]; } | { name?: any; args?: any; }`, which is a `Json`-compatible version of a type found in `eth-method-registry`.
- **BREAKING:** Rename `TransactionState` to `TransactionControllerState` ([#3827](https://github.com/MetaMask/core/pull/3827))
  - This change aligns this controller with other MetaMask controllers.
- **BREAKING:** Update allowed events for the `TransactionControllerMessenger` ([#3827](https://github.com/MetaMask/core/pull/3827))
  - The restricted messenger must allow the following events:
    - `TransactionController:incomingTransactionBlockReceived`
    - `TransactionController:postTransactionBalanceUpdated`
    - `TransactionController:speedUpTransactionAdded`
    - `TransactionController:transactionApproved`
    - `TransactionController:transactionConfirmed`
    - `TransactionController:transactionDropped`
    - `TransactionController:transactionFinished`
    - `TransactionController:transactionFinished`
    - `TransactionController:transactionPublishingSkipped`
    - `TransactionController:transactionRejected`
    - `TransactionController:transactionStatusUpdated`
    - `TransactionController:transactionSubmitted`
    - `TransactionController:unapprovedTransactionAdded`
- **BREAKING:** Update `TransactionMeta` type to be compatible with `Json` ([#3827](https://github.com/MetaMask/core/pull/3827))
  - As dictated by BaseController v2, any types that are part of state need to be compatible with the `Json` type from `@metamask/utils`.
- **BREAKING:** Transform `rpc` property on transaction errors so they're JSON-encodable ([#3827](https://github.com/MetaMask/core/pull/3827))
  - This change also results in typing this property as `Json` instead of `unknown`, avoiding a "Type instantiation is excessively deep and possibly infinite" error when resolving the `TransactionControllerState` type.
- **BREAKING:** Bump dependency and peer dependency on `@metamask/approval-controller` to `^6.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
- **BREAKING:** Bump dependency and peer dependency on `@metamask/gas-fee-controller` to `^14.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
- **BREAKING:** Bump dependency and peer dependency on `@metamask/network-controller` to `^18.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
- **BREAKING:** Bump `@metamask/base-controller` to `^5.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
  - This version has a number of breaking changes. See the changelog for more.
- Add dependency on `@ethersproject/providers` `^5.7.0` ([#4020](https://github.com/MetaMask/core/pull/4020))
- Bump `@metamask/controller-utils` to `^9.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))

### Removed

- **BREAKING:** Remove `TransactionConfig` type ([#3827](https://github.com/MetaMask/core/pull/3827))
  - The properties in this type have been absorbed into `TransactionControllerOptions`.
- **BREAKING:** Remove `hub` property from TransactionController ([#3827](https://github.com/MetaMask/core/pull/3827))
  - TransactionController now fully makes use of its messenger object to announce various kinds of activities. Instead of subscribing to an event like this:
    ```
    transactionController.hub.on(eventName, ...)
    ```
    use this:
    ```
    messenger.subscribe('TransactionController:${eventName}', ...)
    ```
  - The complete list of renamed events are:
    - `incomingTransactionBlock` -> `TransactionController:incomingTransactionBlockReceived`
    - `post-transaction-balance-updated` -> `TransactionController:postTransactionBalanceUpdated`
    - `transaction-approved` -> `TransactionController:transactionApproved`
    - `transaction-confirmed` -> `TransactionController:transactionConfirmed`
    - `transaction-dropped` -> `TransactionController:transactionDropped`
    - `transaction-finished` -> `TransactionController:transactionFinished`
    - `transaction-rejected` -> `TransactionController:transactionRejected`
    - `transaction-status-update` -> `TransactionController:transactionStatusUpdated`
    - `transaction-submitted` -> `TransactionController:transactionSubmitted`
    - `unapprovedTransaction` -> `TransactionController:unapprovedTransactionAdded`
  - Some events announced the state of specific transactions. These have been removed. Instead, subscribe to the appropriate generic event and check for a specific transaction ID in your event handler:
    - `${transactionId}:finished` -> `TransactionController:transactionFinished`
    - `${transactionId}:speedup` -> `TransactionController:speedUpTransactionAdded`
    - `${transactionId}:publish-skip` -> `TransactionController:transactionPublishingSkipped`

### Fixed

- Fix various methods so that they no longer update transactions in state directly but only via `update` ([#3827](https://github.com/MetaMask/core/pull/3827))
  - `addTransaction`
  - `confirmExternalTransaction`
  - `speedUpTransaction`
  - `updateCustodialTransaction`
  - `updateSecurityAlertResponse`
  - `updateTransaction`
- Fix `handleMethodData` method to update state with an empty registry object instead of blowing up if registry could be found ([#3827](https://github.com/MetaMask/core/pull/3827))

## [24.0.0]

### Added

- Add `normalizeTransactionParams` method ([#3990](https://github.com/MetaMask/core/pull/3990))

### Changed

- **BREAKING**: Remove support for retrieving transactions via Etherscan for Optimism Goerli; add support for Optimism Sepolia instead ([#3999](https://github.com/MetaMask/core/pull/3999))
- Normalize `data` property into an even length hex string ([#3990](https://github.com/MetaMask/core/pull/3990))
- Bump `@metamask/approval-controller` to `^5.1.3` ([#4007](https://github.com/MetaMask/core/pull/4007))
- Bump `@metamask/controller-utils` to `^8.0.4` ([#4007](https://github.com/MetaMask/core/pull/4007))
- Bump `@metamask/gas-fee-controller` to `^13.0.2` ([#4007](https://github.com/MetaMask/core/pull/4007))
- Bump `@metamask/network-controller` to `^17.2.1` ([#4007](https://github.com/MetaMask/core/pull/4007))

## [23.1.0]

### Added

- Add `gasFeeEstimatesLoaded` property to `TransactionMeta` ([#3948](https://github.com/MetaMask/core/pull/3948))
- Add `gasFeeEstimates` property to `TransactionMeta` to be automatically populated on unapproved transactions ([#3913](https://github.com/MetaMask/core/pull/3913))

### Changed

- Use the `linea_estimateGas` RPC method to provide transaction specific gas fee estimates on Linea networks ([#3913](https://github.com/MetaMask/core/pull/3913))

## [23.0.0]

### Added

- **BREAKING:** Constructor now expects a `getNetworkClientRegistry` callback function ([#3643](https://github.com/MetaMask/core/pull/3643))
- **BREAKING:** Messenger now requires `NetworkController:stateChange` to be an allowed event ([#3643](https://github.com/MetaMask/core/pull/3643))
- **BREAKING:** Messenger now requires `NetworkController:findNetworkClientByChainId` and `NetworkController:getNetworkClientById` actions ([#3643](https://github.com/MetaMask/core/pull/3643))
- Adds a feature flag parameter `isMultichainEnabled` passed via the constructor (and defaulted to false), which when passed a truthy value will enable the controller to submit, process, and track transactions concurrently on multiple networks. ([#3643](https://github.com/MetaMask/core/pull/3643))
- Adds `destroy()` method that stops/removes internal polling and listeners ([#3643](https://github.com/MetaMask/core/pull/3643))
- Adds `stopAllIncomingTransactionPolling()` method that stops polling Etherscan for transaction updates relevant to the currently selected network.
  - When called with the `isMultichainEnabled` feature flag on, also stops polling Etherscan for transaction updates relevant to each currently polled networkClientId. ([#3643](https://github.com/MetaMask/core/pull/3643))
- Exports `PendingTransactionOptions` type ([#3643](https://github.com/MetaMask/core/pull/3643))
- Exports `TransactionControllerOptions` type ([#3643](https://github.com/MetaMask/core/pull/3643))

### Changed

- **BREAKING:** `approveTransactionsWithSameNonce()` now requires `chainId` to be populated in for each TransactionParams that is passed ([#3643](https://github.com/MetaMask/core/pull/3643))
- `addTransaction()` now accepts optional `networkClientId` in its options param which specifies the network client that the transaction will be processed with during its lifecycle if the `isMultichainEnabled` feature flag is on ([#3643](https://github.com/MetaMask/core/pull/3643))
  - when called with the `isMultichainEnabled` feature flag off, passing in a networkClientId will cause an error to be thrown.
- `estimateGas()` now accepts optional networkClientId as its last param which specifies the network client that should be used to estimate the required gas for the given transaction ([#3643](https://github.com/MetaMask/core/pull/3643))
  - when called with the `isMultichainEnabled` feature flag is off, the networkClientId param is ignored and the global network client will be used instead.
- `estimateGasBuffered()` now accepts optional networkClientId as its last param which specifies the network client that should be used to estimate the required gas plus buffer for the given transaction ([#3643](https://github.com/MetaMask/core/pull/3643))
  - when called with the `isMultichainEnabled` feature flag is off, the networkClientId param is ignored and the global network client will be used instead.
- `getNonceLock()` now accepts optional networkClientId as its last param which specifies which the network client's nonceTracker should be used to determine the next nonce. ([#3643](https://github.com/MetaMask/core/pull/3643))
  - When called with the `isMultichainEnabled` feature flag on and with networkClientId specified, this method will also restrict acquiring the next nonce by chainId, i.e. if this method is called with two different networkClientIds on the same chainId, only the first call will return immediately with a lock from its respective nonceTracker with the second call being blocked until the first caller releases its lock
  - When called with `isMultichainEnabled` feature flag off, the networkClientId param is ignored and the global network client will be used instead.
- `startIncomingTransactionPolling()` and `updateIncomingTransactions()` now enforce a 5 second delay between requests per chainId to avoid rate limiting ([#3643](https://github.com/MetaMask/core/pull/3643))
- `TransactionMeta` type now specifies an optional `networkClientId` field ([#3643](https://github.com/MetaMask/core/pull/3643))
- `startIncomingTransactionPolling()` now accepts an optional array of `networkClientIds`. ([#3643](https://github.com/MetaMask/core/pull/3643))
  - When `networkClientIds` is provided and the `isMultichainEnabled` feature flag is on, the controller will start polling Etherscan for transaction updates relevant to the networkClientIds.
  - When `networkClientIds` is provided and the `isMultichainEnabled` feature flag is off, nothing will happen.
  - If `networkClientIds` is empty or not provided, the controller will start polling Etherscan for transaction updates relevant to the currently selected network.
- `stopIncomingTransactionPolling()` now accepts an optional array of `networkClientIds`. ([#3643](https://github.com/MetaMask/core/pull/3643))
  - When `networkClientIds` is provided and the `isMultichainEnabled` feature flag is on, the controller will stop polling Ethercsan for transaction updates relevant to the networkClientIds.
  - When `networkClientIds` is provided and the `isMultichainEnabled` feature flag is off, nothing will happen.
  - If `networkClientIds` is empty or not provided, the controller will stop polling Etherscan for transaction updates relevant to the currently selected network.

## [22.0.0]

### Changed

- **BREAKING:** Add peerDependency on `@babel/runtime` ([#3897](https://github.com/MetaMask/core/pull/3897))
- Throw after publishing a canceled or sped-up transaction if already confirmed ([#3800](https://github.com/MetaMask/core/pull/3800))
- Bump `eth-method-registry` from `^3.0.0` to `^4.0.0` ([#3897](https://github.com/MetaMask/core/pull/3897))
- Bump `@metamask/controller-utils` to `^8.0.3` ([#3915](https://github.com/MetaMask/core/pull/3915))
- Bump `@metamask/gas-fee-controller` to `^13.0.1` ([#3915](https://github.com/MetaMask/core/pull/3915))

### Removed

- **BREAKING:** Remove `cancelMultiplier` and `speedUpMultiplier` constructor options as both values are now fixed at `1.1`. ([#3909](https://github.com/MetaMask/core/pull/3909))

### Fixed

- Remove implicit peerDependency on `babel-runtime` ([#3897](https://github.com/MetaMask/core/pull/3897))

## [21.2.0]

### Added

- Add optional `publish` hook to support custom logic instead of submission to the RPC provider ([#3883](https://github.com/MetaMask/core/pull/3883))
- Add `hasNonce` option to `approveTransactionsWithSameNonce` method ([#3883](https://github.com/MetaMask/core/pull/3883))

## [21.1.0]

### Added

- Add `abortTransactionSigning` method ([#3870](https://github.com/MetaMask/core/pull/3870))

## [21.0.1]

### Fixed

- Resolves transaction custodian promise when setting transaction status to `submitted` or `failed` ([#3845](https://github.com/MetaMask/core/pull/3845))
- Fix normalizer ensuring property `type` is always present in `TransactionParams` ([#3817](https://github.com/MetaMask/core/pull/3817))

## [21.0.0]

### Changed

- **BREAKING:** Bump `@metamask/approval-controller` peer dependency to `^5.1.2` ([#3821](https://github.com/MetaMask/core/pull/3821))
- **BREAKING:** Bump `@metamask/gas-fee-controller` peer dependency to `^13.0.0` ([#3821](https://github.com/MetaMask/core/pull/3821))
- **BREAKING:** Bump `@metamask/network-controller` peer dependency to `^17.2.0` ([#3821](https://github.com/MetaMask/core/pull/3821))
- Bump `@metamask/base-controller` to `^4.1.1` ([#3821](https://github.com/MetaMask/core/pull/3821))
- Bump `@metamask/controller-utils` to `^8.0.2` ([#3821](https://github.com/MetaMask/core/pull/3821))

## [20.0.0]

### Changed

- **BREAKING:** Change type of `destinationTokenDecimals` property in `TransactionMeta` to `number` ([#3749](https://github.com/MetaMask/core/pull/3749))

### Fixed

- Handle missing current account in incoming transactions ([#3741](https://github.com/MetaMask/core/pull/3741))

## [19.0.1]

### Changed

- Bump `eth-method-registry` from `^1.1.0` to `^3.0.0` ([#3688](https://github.com/MetaMask/core/pull/3688))

## [19.0.0]

### Changed

- **BREAKING:** Bump `@metamask/approval-controller` dependency and peer dependency from `^5.1.0` to `^5.1.1` ([#3695](https://github.com/MetaMask/core/pull/3695))
- **BREAKING:** Bump `@metamask/gas-fee-controller` dependency and peer dependency from `^11.0.0` to `^12.0.0` ([#3695](https://github.com/MetaMask/core/pull/3695))
- **BREAKING:** Bump `@metamask/network-controller` dependency and peer dependency from `^17.0.0` to `^17.1.0` ([#3695](https://github.com/MetaMask/core/pull/3695))
- Bump `@metamask/base-controller` to `^4.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695))
- Bump `@metamask/controller-utils` to `^8.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695))

### Fixed

- Use estimate gas instead of fixed gas (21k) when a contract is deployed and the gas is not specified ([#3694](https://github.com/MetaMask/core/pull/3694))

## [18.3.1]

### Fixed

- Fix incorrect transaction statuses ([#3676](https://github.com/MetaMask/core/pull/3676))
  - Fix `dropped` status detection by ignoring transactions on other chains.
  - Start polling if network changes and associated transactions are pending.
  - Record `r`, `s`, and `v` values even if zero.
  - Only fail transactions if receipt `status` is explicitly `0x0`.
- Fix incoming transactions on Linea Goerli ([#3674](https://github.com/MetaMask/core/pull/3674))

## [18.3.0]

### Added

- Add optional `getExternalPendingTransactions` callback argument to constructor ([#3587](https://github.com/MetaMask/core/pull/3587))

## [18.2.0]

### Added

- Add the `customNonceValue` property to the transaction metadata ([#3579](https://github.com/MetaMask/core/pull/3579))

### Changed

- Update transaction metadata after approval if the approval result includes the `value.txMeta` property ([#3579](https://github.com/MetaMask/core/pull/3579))
- Add `type` property to all incoming transactions ([#3579](https://github.com/MetaMask/core/pull/3579))

## [18.1.0]

### Added

- Add `cancelMultiplier` and `speedUpMultiplier` constructor arguments to optionally override the default multipliers of `1.5` and `1.1` respectively ([#2678](https://github.com/MetaMask/core/pull/2678))

### Changed

- Populate the `preTxBalance` property before publishing transactions with the `swap` type ([#2678](https://github.com/MetaMask/core/pull/2678))
- Change the status of transactions with matching nonces to `dropped` when confirming a transaction ([#2678](https://github.com/MetaMask/core/pull/2678))

## [18.0.0]

### Added

- Add `updateEditableParams` method ([#2056](https://github.com/MetaMask/core/pull/2056))
- Add `initApprovals` method to trigger the approval flow for any pending transactions during initialisation ([#2056](https://github.com/MetaMask/core/pull/2056))
- Add `getTransactions` method to search transactions using the given criteria and options ([#2056](https://github.com/MetaMask/core/pull/2056))

### Changed

- **BREAKING:** Bump `@metamask/base-controller` to ^4.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
  - This is breaking because the type of the `messenger` has backward-incompatible changes. See the changelog for this package for more.
- **BREAKING:** Add `finished` and `publish-skip` events to `Events` type
- **BREAKING:** Update `TransactionReceipt` type so `transactionIndex` is now a string rather than a number ([#2063](https://github.com/MetaMask/core/pull/2063))
- Bump `nonce-tracker` to ^3.0.0 ([#2040](https://github.com/MetaMask/core/pull/2040))
- The controller now emits a `transaction-status-update` event each time the status of a transaction changes (e.g. submitted, rejected, etc.) ([#2027](https://github.com/MetaMask/core/pull/2027))
- Make `getCurrentAccountEIP1559Compatibility` constructor parameter optional ([#2056](https://github.com/MetaMask/core/pull/2056))
- Normalize the gas values provided to the `speedUpTransaction` and `stopTransaction` methods ([#2056](https://github.com/MetaMask/core/pull/2056))
- Persist any property changes performed by the `afterSign` hook ([#2056](https://github.com/MetaMask/core/pull/2056))
- Report success to the approver if publishing is skipped by the `beforePublish` hook ([#2056](https://github.com/MetaMask/core/pull/2056))
- Update `postTxBalance` after all swap transactions ([#2056](https://github.com/MetaMask/core/pull/2056))
- Bump `@metamask/approval-controller` to ^5.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
- Bump `@metamask/controller-utils` to ^6.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
- Bump `@metamask/gas-fee-controller` to ^11.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
- Bump `@metamask/network-controller` to ^17.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))

## [17.0.0]

### Added

- **BREAKING:** Add additional support swaps support ([#1877](https://github.com/MetaMask/core/pull/1877))
  - Swap transaction updates can be prevented by setting `disableSwaps` as `true`. If not set it will default to `false`.
  - If `disableSwaps` is `false` or not set, then the `createSwapsTransaction` callback MUST be defined.
- Add optional hooks to support alternate flows ([#1787](https://github.com/MetaMask/core/pull/1787))
  - Add the `getAdditionalSignArguments` hook to provide additional arguments when signing.
  - Add the `beforeApproveOnInit` hook to execute additional logic before starting an approval flow for a transaction during initialization. Return `false` to skip the transaction.
  - Add the `afterSign` hook to execute additional logic after signing a transaction. Return `false` to not change the `status` to `signed`.
  - Add the `beforePublish` hook to execute additional logic before publishing a transaction. Return `false` to prevent the transaction being submitted.
- Add additional persisted transaction support during initialization and on network change ([#1916](https://github.com/MetaMask/core/pull/1916))
  - Initialise approvals for unapproved transactions on the current network.
  - Add missing gas values for unapproved transactions on the current network.
  - Submit any approved transactions on the current network.
- Support saved gas fees ([#1966](https://github.com/MetaMask/core/pull/1966))
  - Add optional `getSavedGasFees` callback to constructor.
- Add `updateCustodialTransaction` method to update custodial transactions ([#2018](https://github.com/MetaMask/core/pull/2018))
- Add `accessList` to txParam types ([#2016](https://github.com/MetaMask/core/pull/2016))
- Add `estimateGasBuffered` method to estimate gas and apply a specific buffer multiplier ([#2021](https://github.com/MetaMask/core/pull/2021))
- Add `updateSecurityAlertResponse` method ([#1985](https://github.com/MetaMask/core/pull/1985))
- Add gas values validation ([#1978](https://github.com/MetaMask/core/pull/1978))
- Add `approveTransactionsWithSameNonce` method ([#1961](https://github.com/MetaMask/core/pull/1961))
- Add `clearUnapprovedTransactions` method ([#1979](https://github.com/MetaMask/core/pull/1979))
- Add `updatePreviousGasParams` method ([#1943](https://github.com/MetaMask/core/pull/1943))
- Emit additional events to support metrics in the clients ([#1894](https://github.com/MetaMask/core/pull/1894))
- Populate the `firstRetryBlockNumber`, `retryCount`, and `warning` properties in the transaction metadata. ([#1896](https://github.com/MetaMask/core/pull/1896))

### Changed

- **BREAKING:** Pending transactions are now automatically resubmitted. ([#1896](https://github.com/MetaMask/core/pull/1896))
  - This can be disabled by setting the new `pendingTransactions.isResubmitEnabled` constructor option to `false`.
- **BREAKING:** Bump dependency and peer dependency on `@metamask/network-controller` to ^16.0.0
- Persist specific error properties in core transaction metadata ([#1915](https://github.com/MetaMask/core/pull/1915))
  - Create `TransactionError` type with explicit properties.
- Align core transaction error messages with extension ([#1980](https://github.com/MetaMask/core/pull/1980))
  - Catch of the `initApprovals` method to skip logging when the error is `userRejectedRequest`.
- Create an additional transaction metadata entry when calling `stopTransaction` ([#1998](https://github.com/MetaMask/core/pull/1998))
- Bump dependency `@metamask/eth-query` from ^3.0.1 to ^4.0.0 ([#2028](https://github.com/MetaMask/core/pull/2028))
- Bump dependency and peer dependency on `@metamask/gas-fee-controller` to ^10.0.1
- Bump @metamask/utils from 8.1.0 to 8.2.0 ([#1957](https://github.com/MetaMask/core/pull/1957))

## [16.0.0]

### Changed

- **BREAKING:** Bump dependency and peer dependency on `@metamask/gas-fee-controller` to ^10.0.0
- Bump dependency and peer dependency on `@metamask/network-controller` to ^15.1.0

## [15.0.0]

### Changed

- **BREAKING:** Bump dependency and peer dependency on `@metamask/network-controller` to ^15.0.0
- Bump dependency on `@metamask/rpc-errors` to ^6.1.0 ([#1653](https://github.com/MetaMask/core/pull/1653))
- Bump dependency and peer dependency on `@metamask/approval-controller` to ^4.0.1

## [14.0.0]

### Added

- **BREAKING:** Add required `getPermittedAccounts` argument to constructor, used to validate `from` addresses ([#1722](https://github.com/MetaMask/core/pull/1722))
- Add `securityProviderRequest` option to constructor ([#1725](https://github.com/MetaMask/core/pull/1725))
- Add `method` option to `addTransaction` method ([#1725](https://github.com/MetaMask/core/pull/1725))
- Add `securityProviderRequest` property to TransactionMetaBase ([#1725](https://github.com/MetaMask/core/pull/1725))
- Add SecurityProviderRequest type ([#1725](https://github.com/MetaMask/core/pull/1725))
- Update `addTransaction` to set `securityProviderRequest` on transaction metadata when requested to do so ([#1725](https://github.com/MetaMask/core/pull/1725))
- Update `txParams` validation to validate `chainId` ([#1723](https://github.com/MetaMask/core/pull/1723))
- Update `addTransaction` to ensure allowed `from` address when `origin` is specified ([#1722](https://github.com/MetaMask/core/pull/1722))

### Changed

- Bump dependency on `@metamask/utils` to ^8.1.0 ([#1639](https://github.com/MetaMask/core/pull/1639))
- Bump dependency and peer dependency on `@metamask/approval-controller` to ^4.0.0
- Bump dependency on `@metamask/base-controller` to ^3.2.3
- Bump dependency on `@metamask/controller-utils` to ^5.0.2
- Bump dependency and peer dependency on `@metamask/network-controller` to ^14.0.0

### Removed

- **BREAKING:** Remove `interval` config option ([#1746](https://github.com/MetaMask/core/pull/1746))
  - The block tracker (which has its own interval) is now used to poll for pending transactions instead.
- **BREAKING:** Remove `poll` method ([#1746](https://github.com/MetaMask/core/pull/1746))
  - The block tracker is assumed to be running, TransactionController does not offer a way to stop it.
- **BREAKING:** Remove `queryTransactionStatuses` method ([#1746](https://github.com/MetaMask/core/pull/1746))
  - This functionality has been moved to a private interface and there is no way to use it externally.

## [13.0.0]

### Changed

- **BREAKING**: Add required `getCurrentAccountEIP1559Compatibility` and `getCurrentNetworkEIP1559Compatibility` callback arguments to constructor ([#1693](https://github.com/MetaMask/core/pull/1693))
- Update `validateTxParams` to throw standardised errors using the `@metamask/rpc-errors` package ([#1690](https://github.com/MetaMask/core/pull/1690))
  - The dependency `eth-rpc-errors` has been replaced by `@metamask/rpc-errors`
- Preserve `type` transaction parameter for legacy transactions ([#1713](https://github.com/MetaMask/core/pull/1713))
- Update TypeScript to v4.8.x ([#1718](https://github.com/MetaMask/core/pull/1718))

## [12.0.0]

### Changed

- **BREAKING**: Use only `chainId` to determine if a transaction belongs to the current network ([#1633](https://github.com/MetaMask/core/pull/1633))
  - No longer uses `networkID` as a fallback if `chainId` is missing
- **BREAKING**: Change `TransactionMeta.chainId` to be required ([#1633](https://github.com/MetaMask/core/pull/1633))
- **BREAKING**: Bump peer dependency on `@metamask/network-controller` to ^13.0.0 ([#1633](https://github.com/MetaMask/core/pull/1633))
- Update `TransactionMeta.networkID` as deprecated ([#1633](https://github.com/MetaMask/core/pull/1633))
- Change `TransactionMeta.networkID` to be readonly ([#1633](https://github.com/MetaMask/core/pull/1633))
- Bump dependency on `@metamask/controller-utils` to ^5.0.0 ([#1633](https://github.com/MetaMask/core/pull/1633))

### Removed

- Remove `networkId` param from `RemoteTransactionSource.isSupportedNetwork()` interface ([#1633](https://github.com/MetaMask/core/pull/1633))
- Remove `currentNetworkId` property from `RemoteTransactionSourceRequest` ([#1633](https://github.com/MetaMask/core/pull/1633))

## [11.1.0]

### Added

- Add `type` property to the transaction metadata ([#1670](https://github.com/MetaMask/core/pull/1670))

## [11.0.0]

### Added

- Add optional `getLastBlockVariations` method to `RemoteTransactionSource` type ([#1668](https://github.com/MetaMask/core/pull/1668))
- Add `updateTransactionGasFees` method to `TransactionController` ([#1674](https://github.com/MetaMask/core/pull/1674))
- Add `r`, `s` and `v` properties to the transaction metadata ([#1664](https://github.com/MetaMask/core/pull/1664))
- Add `sendFlowHistory` property to the transaction metadata ([#1665](https://github.com/MetaMask/core/pull/1665))
- Add `updateTransactionSendFlowHistory` method to `TransactionController` ([#1665](https://github.com/MetaMask/core/pull/1665))
- Add `originalGasEstimate` property to the transaction metadata ([#1656](https://github.com/MetaMask/core/pull/1656))
- Add `incomingTransactions.queryEntireHistory` constructor option ([#1652](https://github.com/MetaMask/core/pull/1652))

### Changed

- **BREAKING**: Remove `apiKey` property from `RemoteTransactionSourceRequest` type ([#1668](https://github.com/MetaMask/core/pull/1668))
- **BREAKING**: Remove unused `FetchAllOptions` type from `TransactionController` ([#1668](https://github.com/MetaMask/core/pull/1668))
- **BREAKING**: Remove `incomingTransactions.apiKey` constructor option ([#1668](https://github.com/MetaMask/core/pull/1668))
- **BREAKING**: Rename the `transaction` object to `txParams` in the transaction metadata ([#1651](https://github.com/MetaMask/core/pull/1651))
- **BREAKING**: Add `disableHistory` constructor option ([#1657](https://github.com/MetaMask/core/pull/1657))
  - Defaults to `false` but will increase state size considerably unless disabled
- **BREAKING**: Add `disableSendFlowHistory` constructor option ([#1665](https://github.com/MetaMask/core/pull/1665))
  - Defaults to `false` but will increase state size considerably unless disabled
- **BREAKING**: Rename the `transactionHash` property to `hash` in the transaction metadata

### Fixed

- Fix the sorting of incoming and updated transactions ([#1652](https://github.com/MetaMask/core/pull/1652))
- Prevent rate limit errors when `incomingTransactions.includeTokenTransfers` is `true` by by alternating Etherscan request types on each update ([#1668](https://github.com/MetaMask/core/pull/1668))

## [10.0.0]

### Added

- Add `submittedTime` to the transaction metadata ([#1645](https://github.com/MetaMask/core/pull/1645))
- Add optional `actionId` argument to `addTransaction` and `speedUpTransaction` to prevent duplicate requests ([#1582](https://github.com/MetaMask/core/pull/1582))
- Add `confirmExternalTransaction` method ([#1625](https://github.com/MetaMask/core/pull/1625))

### Changed

- **BREAKING**: Rename `rawTransaction` to `rawTx` in the transaction metadata ([#1624](https://github.com/MetaMask/core/pull/1624))

## [9.2.0]

### Added

- Persist `estimatedBaseFee` in `stopTransaction` and `speedUpTransaction` ([#1621](https://github.com/MetaMask/core/pull/1621))
- Add `securityAlertResponse` to `addTransaction` `opts` argument ([#1636](https://github.com/MetaMask/core/pull/1636))

## [9.1.0]

### Added

- Add `blockTimestamp` to `TransactionMetaBase` type ([#1616](https://github.com/MetaMask/core/pull/1616))
- Update `queryTransactionStatuses` to populate `blockTimestamp` on each transaction when it is verified ([#1616](https://github.com/MetaMask/core/pull/1616))

### Changed

- Bump dependency and peer dependency on `@metamask/approval-controller` to ^3.5.1
- Bump dependency on `@metamask/base-controller` to ^3.2.1
- Bump dependency on `@metamask/controller-utils` to ^4.3.2
- Bump dependency and peer dependency on `@metamask/network-controller` to ^12.1.2

## [9.0.0]

### Added

- Add `baseFeePerGas` to transaction metadata ([#1590](https://github.com/MetaMask/core/pull/1590))
- Add `txReceipt` to transaction metadata ([#1592](https://github.com/MetaMask/core/pull/1592))
- Add `initApprovals` method to generate approval requests from unapproved transactions ([#1575](https://github.com/MetaMask/core/pull/1575))
- Add `dappSuggestedGasFees` to transaction metadata ([#1617](https://github.com/MetaMask/core/pull/1617))
- Add optional `incomingTransactions` constructor arguments ([#1579](https://github.com/MetaMask/core/pull/1579))
  - `apiKey`
  - `includeTokenTransfers`
  - `isEnabled`
  - `updateTransactions`
- Add incoming transaction methods ([#1579](https://github.com/MetaMask/core/pull/1579))
  - `startIncomingTransactionPolling`
  - `stopIncomingTransactionPolling`
  - `updateIncomingTransactions`
- Add `requireApproval` option to `addTransaction` method options ([#1580](https://github.com/MetaMask/core/pull/1580))
- Add `address` argument to `wipeTransactions` method ([#1573](https://github.com/MetaMask/core/pull/1573))

### Changed

- **BREAKING**: Add required `getSelectedAddress` callback argument to constructor ([#1579](https://github.com/MetaMask/core/pull/1579))
- **BREAKING**: Add `isSupportedNetwork` method to `RemoteTransactionSource` interface ([#1579](https://github.com/MetaMask/core/pull/1579))
- **BREAKING**: Move all but first argument to options bag in `addTransaction` method ([#1576](https://github.com/MetaMask/core/pull/1576))
- **BREAKING**: Update properties of `RemoteTransactionSourceRequest` type ([#1579](https://github.com/MetaMask/core/pull/1579))
  - The `fromBlock` property has changed from `string` to `number`
  - The `networkType` property has been removed
  - This type is intended mainly for internal use, so it's likely this change doesn't affect most projects

### Removed

- **BREAKING**: Remove `fetchAll` method ([#1579](https://github.com/MetaMask/core/pull/1579))
  - This method was used to fetch transaction history from Etherscan
  - This is now handled automatically by the controller on each new block, if polling is enabled
  - Polling can be enabled or disabled by calling `startIncomingTransactionPolling` or `stopIncomingTransactionPolling` respectively
  - An immediate update can be requested by calling `updateIncomingTransactions`
  - The new constructor parameter `incomingTransactions.isEnabled` acts as an override to disable this functionality based on a client preference for example
- **BREAKING**: Remove `prepareUnsignedEthTx` and `getCommonConfiguration` methods ([#1581](https://github.com/MetaMask/core/pull/1581))
  - These methods were intended mainly for internal use, so it's likely this change doesn't affect most projects

## [8.0.1]

### Changed

- Replace `eth-query` ^2.1.2 with `@metamask/eth-query` ^3.0.1 ([#1546](https://github.com/MetaMask/core/pull/1546))

## [8.0.0]

### Changed

- **BREAKING**: Change `babel-runtime` from a `dependency` to a `peerDependency` ([#1504](https://github.com/MetaMask/core/pull/1504))
- Update `@metamask/utils` to `^6.2.0` ([#1514](https://github.com/MetaMask/core/pull/1514))

## [7.1.0]

### Added

- Expose `HARDFORK` constant ([#1423](https://github.com/MetaMask/core/pull/1423))
- Add support for transactions on Linea networks ([#1423](https://github.com/MetaMask/core/pull/1423))

## [7.0.0]

### Changed

- **BREAKING**: Change the approveTransaction and cancelTransaction methods to private ([#1435](https://github.com/MetaMask/core/pull/1435))
  - Consumers should migrate from use of these methods to use of `processApproval`.
- Update the TransactionController to await the approval request promise before automatically performing the relevant logic, either signing and submitting the transaction, or cancelling it ([#1435](https://github.com/MetaMask/core/pull/1435))

## [6.1.0]

### Changed

- Relax types of `provider` and `blockTracker` options ([#1443](https://github.com/MetaMask/core/pull/1443))
  - The types used to require proxy versions of Provider and BlockTracker. Now they just require the non-proxy versions, which are a strict subset of the proxied versions.

## [6.0.0]

### Added

- Update transaction controller to automatically initiate, finalize, and cancel approval requests as transactions move through states ([#1241](https://github.com/MetaMask/core/pull/1241))
  - The `ApprovalController:addRequest` action will be called when a new transaction is initiated
  - The `ApprovalController:rejectRequest` action will be called if a transaction fails
  - The `ApprovalController:acceptRequest` action will be called when a transaction is approved

### Changed

- **BREAKING:** Bump to Node 16 ([#1262](https://github.com/MetaMask/core/pull/1262))
- **BREAKING:** Update `@metamask/network-controller` dependency and peer dependency ([#1367](https://github.com/MetaMask/core/pull/1367))
  - This affects the `getNetworkState` and `onNetworkStateChange` constructor parameters
- **BREAKING:** Change format of chain ID in state to `Hex` ([#1367](https://github.com/MetaMask/core/pull/1367))
  - The `chainId` property of the `Transaction` type has been changed from `number` to `Hex`
  - The `chainId` property of the `TransactionMeta` type has been changed from a decimal `string` to `Hex`, and the `transaction` property has been updated along with the `Transaction` type (as described above).
  - The state property `transactions` is an array of `TransactionMeta` objects, so it has changed according to the description above.
    - This requires a state migration: each entry should have the `chainId` property converted from a decimal `string` to `Hex`, and the `transaction.chainId` property changed from `number` to `Hex`.
  - The `addTransaction` and `estimateGas` methods now expect the first parameter (`transaction`) to use type `Hex` for the `chainId` property.
  - The `updateTransaction` method now expects the `transactionMeta` parameter to use type `Hex` for the `chainId` property (and for the nested `transaction.chainId` property)
- **BREAKING:** Add `messenger` as required constructor parameter ([#1241](https://github.com/MetaMask/core/pull/1241))
- **BREAKING:** Add `@metamask/approval-controller` as a dependency and peer dependency ([#1241](https://github.com/MetaMask/core/pull/1241), [#1393](https://github.com/MetaMask/core/pull/1393))
- Add `@metamask/utils` dependency ([#1367](https://github.com/MetaMask/core/pull/1367))

### Fixed

- Fix inaccurate hard-coded `chainId` on incoming token transactions ([#1366](https://github.com/MetaMask/core/pull/1366))

## [5.0.0]

### Changed

- **BREAKING**: peerDeps: @metamask/network-controller@6.0.0->8.0.0 ([#1196](https://github.com/MetaMask/core/pull/1196))
- deps: eth-rpc-errors@4.0.0->4.0.2 ([#1215](https://github.com/MetaMask/core/pull/1215))
- Add nonce tracker to transactions controller ([#1147](https://github.com/MetaMask/core/pull/1147))
  - Previously this controller would get the next nonce by calling `eth_getTransactionCount` with a block reference of `pending`. The next nonce would then be returned from our middleware (within `web3-provider-engine`).
  - Instead we're now using the nonce tracker to get the next nonce, dropping our reliance on this `eth_getTransactionCount` middleware. This will let us drop that middleware in a future update without impacting the transaction controller.
  - This should result in no functional changes, except that the nonce middleware is no longer required.

## [4.0.1]

### Changed

- Use `NetworkType` enum for chain configuration ([#1132](https://github.com/MetaMask/core/pull/1132))

## [4.0.0]

### Removed

- **BREAKING:** Remove `isomorphic-fetch` ([#1106](https://github.com/MetaMask/controllers/pull/1106))
  - Consumers must now import `isomorphic-fetch` or another polyfill themselves if they are running in an environment without `fetch`

## [3.0.0]

### Added

- Add Etherscan API support for Sepolia and Goerli ([#1041](https://github.com/MetaMask/controllers/pull/1041))
- Export `isEIP1559Transaction` function from package ([#1058](https://github.com/MetaMask/controllers/pull/1058))

### Changed

- **BREAKING**: Drop Etherscan API support for Ropsten, Rinkeby, and Kovan ([#1041](https://github.com/MetaMask/controllers/pull/1041))
- Rename this repository to `core` ([#1031](https://github.com/MetaMask/controllers/pull/1031))
- Update `@metamask/controller-utils` package ([#1041](https://github.com/MetaMask/controllers/pull/1041))

## [2.0.0]

### Changed

- **BREAKING:** Update `getNetworkState` constructor option to take an object with `providerConfig` property rather than `providerConfig` ([#995](https://github.com/MetaMask/core/pull/995))
- Relax dependency on `@metamask/base-controller`, `@metamask/controller-utils`, and `@metamask/network-controller` (use `^` instead of `~`) ([#998](https://github.com/MetaMask/core/pull/998))

## [1.0.0]

### Added

- Initial release

  - As a result of converting our shared controllers repo into a monorepo ([#831](https://github.com/MetaMask/core/pull/831)), we've created this package from select parts of [`@metamask/controllers` v33.0.0](https://github.com/MetaMask/core/tree/v33.0.0), namely:

    - Everything in `src/transaction`
    - Transaction-related functions from `src/util.ts` and accompanying tests

    All changes listed after this point were applied to this package following the monorepo conversion.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@60.8.0...HEAD
[60.8.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@60.7.0...@metamask/transaction-controller@60.8.0
[60.7.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@60.6.1...@metamask/transaction-controller@60.7.0
[60.6.1]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@60.6.0...@metamask/transaction-controller@60.6.1
[60.6.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@60.5.0...@metamask/transaction-controller@60.6.0
[60.5.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@60.4.0...@metamask/transaction-controller@60.5.0
[60.4.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@60.3.0...@metamask/transaction-controller@60.4.0
[60.3.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@60.2.0...@metamask/transaction-controller@60.3.0
[60.2.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@60.1.0...@metamask/transaction-controller@60.2.0
[60.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@60.0.0...@metamask/transaction-controller@60.1.0
[60.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@59.2.0...@metamask/transaction-controller@60.0.0
[59.2.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@59.1.0...@metamask/transaction-controller@59.2.0
[59.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@59.0.0...@metamask/transaction-controller@59.1.0
[59.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@58.1.1...@metamask/transaction-controller@59.0.0
[58.1.1]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@58.1.0...@metamask/transaction-controller@58.1.1
[58.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@58.0.0...@metamask/transaction-controller@58.1.0
[58.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@57.4.0...@metamask/transaction-controller@58.0.0
[57.4.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@57.3.0...@metamask/transaction-controller@57.4.0
[57.3.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@57.2.0...@metamask/transaction-controller@57.3.0
[57.2.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@57.1.0...@metamask/transaction-controller@57.2.0
[57.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@57.0.0...@metamask/transaction-controller@57.1.0
[57.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@56.3.0...@metamask/transaction-controller@57.0.0
[56.3.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@56.2.0...@metamask/transaction-controller@56.3.0
[56.2.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@56.1.0...@metamask/transaction-controller@56.2.0
[56.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@56.0.0...@metamask/transaction-controller@56.1.0
[56.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@55.0.2...@metamask/transaction-controller@56.0.0
[55.0.2]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@55.0.1...@metamask/transaction-controller@55.0.2
[55.0.1]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@55.0.0...@metamask/transaction-controller@55.0.1
[55.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@54.4.0...@metamask/transaction-controller@55.0.0
[54.4.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@54.3.0...@metamask/transaction-controller@54.4.0
[54.3.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@54.2.0...@metamask/transaction-controller@54.3.0
[54.2.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@54.1.0...@metamask/transaction-controller@54.2.0
[54.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@54.0.0...@metamask/transaction-controller@54.1.0
[54.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@53.0.0...@metamask/transaction-controller@54.0.0
[53.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@52.3.0...@metamask/transaction-controller@53.0.0
[52.3.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@52.2.0...@metamask/transaction-controller@52.3.0
[52.2.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@52.1.0...@metamask/transaction-controller@52.2.0
[52.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@52.0.0...@metamask/transaction-controller@52.1.0
[52.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@51.0.0...@metamask/transaction-controller@52.0.0
[51.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@50.0.0...@metamask/transaction-controller@51.0.0
[50.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@49.0.0...@metamask/transaction-controller@50.0.0
[49.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@48.2.0...@metamask/transaction-controller@49.0.0
[48.2.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@48.1.0...@metamask/transaction-controller@48.2.0
[48.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@48.0.0...@metamask/transaction-controller@48.1.0
[48.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@47.0.0...@metamask/transaction-controller@48.0.0
[47.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@46.0.0...@metamask/transaction-controller@47.0.0
[46.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@45.1.0...@metamask/transaction-controller@46.0.0
[45.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@45.0.0...@metamask/transaction-controller@45.1.0
[45.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@44.1.0...@metamask/transaction-controller@45.0.0
[44.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@44.0.0...@metamask/transaction-controller@44.1.0
[44.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@43.0.0...@metamask/transaction-controller@44.0.0
[43.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@42.1.0...@metamask/transaction-controller@43.0.0
[42.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@42.0.0...@metamask/transaction-controller@42.1.0
[42.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@41.1.0...@metamask/transaction-controller@42.0.0
[41.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@41.0.0...@metamask/transaction-controller@41.1.0
[41.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@40.1.0...@metamask/transaction-controller@41.0.0
[40.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@40.0.0...@metamask/transaction-controller@40.1.0
[40.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@39.1.0...@metamask/transaction-controller@40.0.0
[39.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@39.0.0...@metamask/transaction-controller@39.1.0
[39.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@38.3.0...@metamask/transaction-controller@39.0.0
[38.3.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@38.2.0...@metamask/transaction-controller@38.3.0
[38.2.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@38.1.0...@metamask/transaction-controller@38.2.0
[38.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@38.0.0...@metamask/transaction-controller@38.1.0
[38.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@37.3.0...@metamask/transaction-controller@38.0.0
[37.3.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@37.2.0...@metamask/transaction-controller@37.3.0
[37.2.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@37.1.0...@metamask/transaction-controller@37.2.0
[37.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@37.0.0...@metamask/transaction-controller@37.1.0
[37.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@36.1.0...@metamask/transaction-controller@37.0.0
[36.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@36.0.0...@metamask/transaction-controller@36.1.0
[36.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@35.2.0...@metamask/transaction-controller@36.0.0
[35.2.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@35.1.1...@metamask/transaction-controller@35.2.0
[35.1.1]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@35.1.0...@metamask/transaction-controller@35.1.1
[35.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@35.0.1...@metamask/transaction-controller@35.1.0
[35.0.1]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@35.0.0...@metamask/transaction-controller@35.0.1
[35.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@34.0.0...@metamask/transaction-controller@35.0.0
[34.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@33.0.1...@metamask/transaction-controller@34.0.0
[33.0.1]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@33.0.0...@metamask/transaction-controller@33.0.1
[33.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@32.0.0...@metamask/transaction-controller@33.0.0
[32.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@31.0.0...@metamask/transaction-controller@32.0.0
[31.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@30.0.0...@metamask/transaction-controller@31.0.0
[30.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@29.1.0...@metamask/transaction-controller@30.0.0
[29.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@29.0.2...@metamask/transaction-controller@29.1.0
[29.0.2]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@29.0.1...@metamask/transaction-controller@29.0.2
[29.0.1]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@29.0.0...@metamask/transaction-controller@29.0.1
[29.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@28.1.1...@metamask/transaction-controller@29.0.0
[28.1.1]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@28.1.0...@metamask/transaction-controller@28.1.1
[28.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@28.0.0...@metamask/transaction-controller@28.1.0
[28.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@27.0.1...@metamask/transaction-controller@28.0.0
[27.0.1]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@27.0.0...@metamask/transaction-controller@27.0.1
[27.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@26.0.0...@metamask/transaction-controller@27.0.0
[26.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@25.3.0...@metamask/transaction-controller@26.0.0
[25.3.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@25.2.1...@metamask/transaction-controller@25.3.0
[25.2.1]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@25.2.0...@metamask/transaction-controller@25.2.1
[25.2.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@25.1.0...@metamask/transaction-controller@25.2.0
[25.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@25.0.0...@metamask/transaction-controller@25.1.0
[25.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@24.0.0...@metamask/transaction-controller@25.0.0
[24.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@23.1.0...@metamask/transaction-controller@24.0.0
[23.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@23.0.0...@metamask/transaction-controller@23.1.0
[23.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@22.0.0...@metamask/transaction-controller@23.0.0
[22.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@21.2.0...@metamask/transaction-controller@22.0.0
[21.2.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@21.1.0...@metamask/transaction-controller@21.2.0
[21.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@21.0.1...@metamask/transaction-controller@21.1.0
[21.0.1]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@21.0.0...@metamask/transaction-controller@21.0.1
[21.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@20.0.0...@metamask/transaction-controller@21.0.0
[20.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@19.0.1...@metamask/transaction-controller@20.0.0
[19.0.1]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@19.0.0...@metamask/transaction-controller@19.0.1
[19.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@18.3.1...@metamask/transaction-controller@19.0.0
[18.3.1]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@18.3.0...@metamask/transaction-controller@18.3.1
[18.3.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@18.2.0...@metamask/transaction-controller@18.3.0
[18.2.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@18.1.0...@metamask/transaction-controller@18.2.0
[18.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@18.0.0...@metamask/transaction-controller@18.1.0
[18.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@17.0.0...@metamask/transaction-controller@18.0.0
[17.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@16.0.0...@metamask/transaction-controller@17.0.0
[16.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@15.0.0...@metamask/transaction-controller@16.0.0
[15.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@14.0.0...@metamask/transaction-controller@15.0.0
[14.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@13.0.0...@metamask/transaction-controller@14.0.0
[13.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@12.0.0...@metamask/transaction-controller@13.0.0
[12.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@11.1.0...@metamask/transaction-controller@12.0.0
[11.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@11.0.0...@metamask/transaction-controller@11.1.0
[11.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@10.0.0...@metamask/transaction-controller@11.0.0
[10.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@9.2.0...@metamask/transaction-controller@10.0.0
[9.2.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@9.1.0...@metamask/transaction-controller@9.2.0
[9.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@9.0.0...@metamask/transaction-controller@9.1.0
[9.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@8.0.1...@metamask/transaction-controller@9.0.0
[8.0.1]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@8.0.0...@metamask/transaction-controller@8.0.1
[8.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@7.1.0...@metamask/transaction-controller@8.0.0
[7.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@7.0.0...@metamask/transaction-controller@7.1.0
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@6.1.0...@metamask/transaction-controller@7.0.0
[6.1.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@6.0.0...@metamask/transaction-controller@6.1.0
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@5.0.0...@metamask/transaction-controller@6.0.0
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@4.0.1...@metamask/transaction-controller@5.0.0
[4.0.1]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@4.0.0...@metamask/transaction-controller@4.0.1
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@3.0.0...@metamask/transaction-controller@4.0.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@2.0.0...@metamask/transaction-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@1.0.0...@metamask/transaction-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/transaction-controller@1.0.0
