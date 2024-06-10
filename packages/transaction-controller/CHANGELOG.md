# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@32.0.0...HEAD
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
