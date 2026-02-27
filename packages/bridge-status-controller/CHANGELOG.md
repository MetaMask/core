# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Added optional `abTests` property to `BridgeHistoryItem` to persist A/B test context across the transaction lifecycle ([#8007](https://github.com/MetaMask/core/pull/8007))
- Added optional `abTests` parameter to `StartPollingForBridgeTxStatusArgs` ([#8007](https://github.com/MetaMask/core/pull/8007))
- Added optional `abTests` parameter to `submitTx` and `submitIntent` methods for A/B test experiment attribution ([#8007](https://github.com/MetaMask/core/pull/8007))
- `trackUnifiedSwapBridgeEvent` now resolves `ab_tests` from event properties or transaction history and includes it in emitted events ([#8007](https://github.com/MetaMask/core/pull/8007))

### Changed

- Bump `@metamask/bridge-controller` from `^67.1.1` to `^67.3.0` ([#8024](https://github.com/MetaMask/core/pull/8024), [#8051](https://github.com/MetaMask/core/pull/8051))
- Bump `@metamask/transaction-controller` from `^62.17.1` to `^62.19.0` ([#8005](https://github.com/MetaMask/core/pull/8005), [#8031](https://github.com/MetaMask/core/pull/8031))

## [67.0.1]

### Changed

- Bump `@metamask/accounts-controller` from `^36.0.0` to `^36.0.1` ([#7996](https://github.com/MetaMask/core/pull/7996))
- Bump `@metamask/gas-fee-controller` from `^26.0.2` to `^26.0.3` ([#7996](https://github.com/MetaMask/core/pull/7996))
- Bump `@metamask/network-controller` from `^29.0.0` to `^30.0.0` ([#7996](https://github.com/MetaMask/core/pull/7996))
- Bump `@metamask/polling-controller` from `^16.0.2` to `^16.0.3` ([#7996](https://github.com/MetaMask/core/pull/7996))
- Bump `@metamask/transaction-controller` from `^62.17.0` to `^62.17.1` ([#7996](https://github.com/MetaMask/core/pull/7996))
- Bump `@metamask/controller-utils` from `^11.18.0` to `^11.19.0` ([#7995](https://github.com/MetaMask/core/pull/7995))
- Bump `@metamask/bridge-controller` from `^67.0.0` to `^67.1.1` ([#7995](https://github.com/MetaMask/core/pull/7995), [#7996](https://github.com/MetaMask/core/pull/7996))

## [67.0.0]

### Added

- **BREAKING:** Retrieve JWT token from the ProfileSyncController and include it in bridge request headers ([#7955](https://github.com/MetaMask/core/pull/7955))
- Bump `@metamask/bridge-controller` from `^66.2.0` to `^67.0.0` ([#7961](https://github.com/MetaMask/core/pull/7961))

## [66.1.0]

### Added

- Added `location` property to `BridgeHistoryItem` to persist the entry point across the transaction lifecycle ([#7931](https://github.com/MetaMask/core/pull/7931))
- Added `location` parameter to `StartPollingForBridgeTxStatusArgs` ([#7931](https://github.com/MetaMask/core/pull/7931))
- Added optional `location` parameter to `submitTx` method ([#7931](https://github.com/MetaMask/core/pull/7931))

### Changed

- All post-submission events (`Submitted`, `Completed`, `Failed`, `PollingStatusUpdated`, `StatusValidationFailed`) now include the `location` property from `BridgeHistoryItem` ([#7931](https://github.com/MetaMask/core/pull/7931))

### Fixed

- Fix `usd_amount_source` default value in EVM transaction metrics properties from `100` to `0` ([#7899](https://github.com/MetaMask/core/pull/7899))

## [66.0.2]

### Changed

- Bump `@metamask/bridge-controller` from `^66.1.0` to `^66.1.1 ([#7910](https://github.com/MetaMask/core/pull/7910))

## [66.0.1]

### Changed

- Bump `@metamask/accounts-controller` from `^35.0.2` to `^36.0.0` ([#7897](https://github.com/MetaMask/core/pull/7897))
- Bump `@metamask/bridge-controller` from `^65.3.0` to `^66.1.0` ([#7862](https://github.com/MetaMask/core/pull/7862)), ([#7897](https://github.com/MetaMask/core/pull/7897))
- Bump `@metamask/transaction-controller` from `^62.14.0` to `^62.17.0` ([#7854](https://github.com/MetaMask/core/pull/7854), [#7872](https://github.com/MetaMask/core/pull/7872)), ([#7897](https://github.com/MetaMask/core/pull/7897))

## [66.0.0]

### Added

- Add `Unified SwapBridge Polling Status Updated` metrics event with `status` property (`max_polling_reached` or `manually_restarted`), emitted when polling stops due to max attempts or is manually restarted ([#7825](https://github.com/MetaMask/core/pull/7825))

### Changed

- **BREAKING** Re-key intent history items and extract intent code into a new IntentManager class
- **BREAKING** handle intent orders in fetch bridge tx function ([#7756](https://github.com/MetaMask/core/pull/7756))
- Bump `@metamask/transaction-controller` from `^62.11.0` to `^62.14.0` ([#7775](https://github.com/MetaMask/core/pull/7775), [#7802](https://github.com/MetaMask/core/pull/7802), [#7832](https://github.com/MetaMask/core/pull/7832))
- Bump `@metamask/bridge-controller` from `^65.1.0` to `^65.3.0` ([#7802](https://github.com/MetaMask/core/pull/7802), [#7837](https://github.com/MetaMask/core/pull/7837))

### Fixed

- Fix Tron same-chain swap polling and Completed event tracking ([#7697](https://github.com/MetaMask/core/pull/7697))

## [65.0.1]

### Changed

- Bump `@metamask/bridge-controller` from `^65.0.0` to `^65.1.0` ([#7751](https://github.com/MetaMask/core/pull/7751), [#7763](https://github.com/MetaMask/core/pull/7763))
- Bump `@metamask/transaction-controller` from `^62.9.2` to `^62.11.0` ([#7737](https://github.com/MetaMask/core/pull/7737), [#7760](https://github.com/MetaMask/core/pull/7760))

## [65.0.0]

### Changed

- Bump `@metamask/bridge-controller` from `^64.8.2` to `^65.0.0` ([#7731](https://github.com/MetaMask/core/pull/7731))

## [64.4.5]

### Changed

- Bump `@metamask/bridge-controller` from `^64.8.1` to `^64.8.2` ([#7722](https://github.com/MetaMask/core/pull/7722))

### Fixed

- Fix transaction failure tracking for pre-submission failures by using `actionId` as a temporary history key ([#7696](https://github.com/MetaMask/core/pull/7696))

## [64.4.4]

### Changed

- Bump `@metamask/bridge-controller` from `^64.5.1` to `^64.8.1` ([#7667](https://github.com/MetaMask/core/pull/7667), [#7672](https://github.com/MetaMask/core/pull/7672), [#7694](https://github.com/MetaMask/core/pull/7694), [#7700](https://github.com/MetaMask/core/pull/7700), [#7704](https://github.com/MetaMask/core/pull/7704))

### Fixed

- Fix Tron same-chain swap polling and Completed event tracking ([#7697](https://github.com/MetaMask/core/pull/7697))

## [64.4.3]

### Changed

- Bump `@metamask/accounts-controller` from `^35.0.1` to `^35.0.2` ([#7642](https://github.com/MetaMask/core/pull/7642))
- Bump `@metamask/gas-fee-controller` from `^26.0.1` to `^26.0.2` ([#7642](https://github.com/MetaMask/core/pull/7642))
- Bump `@metamask/network-controller` from `^28.0.0` to `^29.0.0` ([#7642](https://github.com/MetaMask/core/pull/7642))
- Bump `@metamask/polling-controller` from `^16.0.1` to `^16.0.2` ([#7642](https://github.com/MetaMask/core/pull/7642))
- Bump `@metamask/transaction-controller` from `^62.9.1` to `^62.9.2` ([#7642](https://github.com/MetaMask/core/pull/7642))
- Bump `@metamask/bridge-controller` from `^64.4.1` to `^64.5.1` ([#7622](https://github.com/MetaMask/core/pull/7622), [#7642](https://github.com/MetaMask/core/pull/7642))

## [64.4.2]

### Changed

- Bump `@metamask/transaction-controller` from `^62.8.0` to `^62.9.1` ([#7602](https://github.com/MetaMask/core/pull/7602), [#7604](https://github.com/MetaMask/core/pull/7604))
- Bump `@metamask/network-controller` from `^27.2.0` to `^28.0.0` ([#7604](https://github.com/MetaMask/core/pull/7604))
- Bump `@metamask/accounts-controller` from `^35.0.0` to `^35.0.1` ([#7604](https://github.com/MetaMask/core/pull/7604))
- Bump `@metamask/bridge-controller` from `^64.4.0` to `^64.4.1` ([#7604](https://github.com/MetaMask/core/pull/7604))
- Bump `@metamask/gas-fee-controller` from `^26.0.0` to `^26.0.1` ([#7604](https://github.com/MetaMask/core/pull/7604))
- Bump `@metamask/polling-controller` from `^16.0.0` to `^16.0.1` ([#7604](https://github.com/MetaMask/core/pull/7604))

## [64.4.1]

### Fixed

- Use `BRIDGE_PREFERRED_GAS_ESTIMATE` from `@metamask/bridge-controller` for gas price estimates to align with validation ([#7582](https://github.com/MetaMask/core/pull/7582))

## [64.4.0]

### Added

- Add intent based transaction support ([#6547](https://github.com/MetaMask/core/pull/6547))

### Changed

- Bump `@metamask/transaction-controller` from `^62.7.0` to `^62.8.0` ([#7596](https://github.com/MetaMask/core/pull/7596))
- Bump `@metamask/bridge-controller` from `^64.3.0` to `^64.4.0` ([#7596](https://github.com/MetaMask/core/pull/7596))
- Bump `@metamask/controller-utils` from `^11.17.0` to `^11.18.0` ([#7583](https://github.com/MetaMask/core/pull/7583))
- Bump `@metamask/network-controller` from `^27.1.0` to `^27.2.0` ([#7583](https://github.com/MetaMask/core/pull/7583))

## [64.3.0]

### Changed

- **BREAKING** Use CrossChain API instead of the intent manager package for intent order submission ([#6547](https://github.com/MetaMask/core/pull/6547))
- Bump `@metamask/snaps-controllers` from `^14.0.1` to `^17.2.0` ([#7550](https://github.com/MetaMask/core/pull/7550))
- Upgrade `@metamask/utils` from `^11.8.1` to `^11.9.0` ([#7511](https://github.com/MetaMask/core/pull/7511))
- Bump `@metamask/network-controller` from `^27.0.0` to `^27.1.0` ([#7534](https://github.com/MetaMask/core/pull/7534))
- Bump `@metamask/controller-utils` from `^11.16.0` to `^11.17.0` ([#7534](https://github.com/MetaMask/core/pull/7534))
- Bump `@metamask/bridge-controller` from `^64.2.0` to `^64.3.0` ([#7574](https://github.com/MetaMask/core/pull/7574))

## [64.2.0]

### Changed

- Bump `@metamask/transaction-controller` from `^62.5.0` to `^62.7.0` ([#7430](https://github.com/MetaMask/core/pull/7430), [#7494](https://github.com/MetaMask/core/pull/7494))
- Bump `@metamask/bridge-controller` from `^64.1.0` to `^64.2.0` ([#7509](https://github.com/MetaMask/core/pull/7509))

## [64.1.0]

### Changed

- Bump `@metamask/bridge-controller` from `^64.0.0` to `^64.1.0` ([#7422](https://github.com/MetaMask/core/pull/7422))
- Bump `@metamask/transaction-controller` from `^62.4.0` to `^62.5.0` ([#7325](https://github.com/MetaMask/core/pull/7325))

## [64.0.1]

### Fixed

- Fix MAX native token swap failing with "insufficient gas" when STX is off by using quote's `txFee` instead of re-estimating gas when `gasIncluded` is true ([#7306](https://github.com/MetaMask/core/pull/7306))

## [64.0.0]

### Changed

- **BREAKING:** Bump `@metamask/bridge-controller` from `^63.2.0` to `^64.0.0` ([#7295](https://github.com/MetaMask/core/pull/7295))
- Improve type safety by replacing tx data type assertions with type predicates ([#7228](https://github.com/MetaMask/core/pull/7228))
- Submit `resetApproval` tx before the tx approval if it is included in the quoteResponse ([#7228](https://github.com/MetaMask/core/pull/7228))
- Bump `@metamask/network-controller` from `^26.0.0` to `^27.0.0` ([#7258](https://github.com/MetaMask/core/pull/7258))
- Bump `@metamask/transaction-controller` from `^62.3.0` to `^62.4.0` ([#7257](https://github.com/MetaMask/core/pull/7257), [#7289](https://github.com/MetaMask/core/pull/7289))

## [63.1.0]

### Changed

- Bump `@metamask/bridge-controller` from `^63.1.0` to `^63.2.0` ([#7245](https://github.com/MetaMask/core/pull/7245))
- Move peer dependencies for controller and service packages to direct dependencies ([#7209](https://github.com/MetaMask/core/pull/7209), [#7220](https://github.com/MetaMask/core/pull/7220), [#7236](https://github.com/MetaMask/core/pull/7236))
  - The dependencies moved are:
    - `@metamask/accounts-controller` (^35.0.0)
    - `@metamask/bridge-controller` (^63.0.0)
    - `@metamask/gas-fee-controller` (^26.0.0)
    - `@metamask/network-controller` (^26.0.0)
    - `@metamask/snaps-controllers` (^14.0.1)
    - `@metamask/transaction-controller` (^62.3.0)
  - In clients, it is now possible for multiple versions of these packages to exist in the dependency tree.
    - For example, this scenario would be valid: a client relies on `@metamask/controller-a` 1.0.0 and `@metamask/controller-b` 1.0.0, and `@metamask/controller-b` depends on `@metamask/controller-a` 1.1.0.
  - Note, however, that the versions specified in the client's `package.json` always "win", and you are expected to keep them up to date so as not to break controller and service intercommunication.
- Bump `@metamask/bridge-controller` from `^63.0.0` to `^63.1.0` ([#7238](https://github.com/MetaMask/core/pull/7238))

### Removed

- Remove direct QuotesReceived event publishing to avoid race conditions that can happen when clients navigate and reset state. Update `submitTx` to accept quotesReceivedContext (replace isLoading/warnings) and propagate context to the BridgeController through the `stopPollingForQuotes call ([#7242](https://github.com/MetaMask/core/pull/7242))

## [63.0.0]

### Changed

- **BREAKING:** Bump `@metamask/bridge-controller` from `^62.0.0` to `^63.0.0` ([#7207](https://github.com/MetaMask/core/pull/7207))

## [62.0.0]

### Changed

- Bump `@metamask/polling-controller` from `^15.0.0` to `^16.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- Bump `@metamask/controller-utils` from `^11.15.0` to `^11.16.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- **BREAKING:** Bump `@metamask/transaction-controller` from `^61.0.0` to `^62.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- **BREAKING:** Bump `@metamask/network-controller` from `^25.0.0` to `^26.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- **BREAKING:** Bump `@metamask/gas-fee-controller` from `^25.0.0` to `^26.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- **BREAKING:** Bump `@metamask/bridge-controller` from `^61.0.0` to `^62.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- **BREAKING:** Bump `@metamask/accounts-controller` from `^34.0.0` to `^35.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- Update `submitTx` handler to accept optional `isLoading` and `warnings` arguments. When `isLoading=true`, the QuotesReceived event is published ([#7182](https://github.com/MetaMask/core/pull/7182))

## [61.0.0]

### Changed

- **BREAKING:** Bump `@metamask/bridge-controller` from `^60.0.0` to `^61.0.0` ([#7179](https://github.com/MetaMask/core/pull/7179))

## [60.1.0]

### Added

- Added support for bridging and swapping tokens on the Tron blockchain ([#6862](https://github.com/MetaMask/core/pull/6862))

## [60.0.0]

### Added

- Add isGasFeeSponsored field in transaction batch params ([#7064](https://github.com/MetaMask/core/pull/7064))

### Changed

- **BREAKING:** Bump `@metamask/bridge-controller` from `^59.0.0` to `^60.0.0` ([#7100](https://github.com/MetaMask/core/pull/7100))

## [59.0.0]

### Changed

- **BREAKING:** Bump `@metamask/bridge-controller` from `^58.0.0` to `^59.0.0` ([#7043](https://github.com/MetaMask/core/pull/7043))

## [58.0.0]

### Changed

- **BREAKING:** Bump `@metamask/bridge-controller` from `^57.0.0` to `^58.0.0` ([#7011](https://github.com/MetaMask/core/pull/7011))

## [57.0.0]

### Changed

- **BREAKING:** Bump `@metamask/bridge-controller` from `^56.0.0` to `^57.0.0` ([#7003](https://github.com/MetaMask/core/pull/7003))

## [56.0.0]

### Changed

- **BREAKING:** Use new `Messenger` from `@metamask/messenger` ([#6444](https://github.com/MetaMask/core/pull/6444))
  - Previously, `BridgeStatusController` accepted a `RestrictedMessenger` instance from `@metamask/base-controller`.
- **BREAKING:** Bump `@metamask/accounts-controller` from `^33.0.0` to `^34.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))
- **BREAKING:** Bump `@metamask/bridge-controller` from `^55.0.0` to `^56.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))
- **BREAKING:** Bump `@metamask/gas-fee-controller` from `^24.0.0` to `^25.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))
- **BREAKING:** Bump `@metamask/network-controller` from `^24.0.0` to `^25.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))
- **BREAKING:** Bump `@metamask/transaction-controller` from `^60.0.0` to `^61.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))
- Bump `@metamask/base-controller` from `^8.4.2` to `^9.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))
- Bump `@metamask/polling-controller` from `^14.0.1` to `^15.0.0` ([#6940](https://github.com/MetaMask/core/pull/6940), [#6962](https://github.com/MetaMask/core/pull/6962))

## [55.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/bridge-controller` from `^54.0.0` to `^55.0.0` ([#6923](https://github.com/MetaMask/core/pull/6923))
- Bump `@metamask/base-controller` from `^8.4.1` to `^8.4.2` ([#6917](https://github.com/MetaMask/core/pull/6917))

## [54.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/bridge-controller` from `^53.0.0` to `^54.0.0` ([#6908](https://github.com/MetaMask/core/pull/6908))

## [53.0.0]

### Fixed

- **BREAKING:** Update QuoteResponse type used in `submitTx` handler ([#6892](https://github.com/MetaMask/core/pull/6892))

## [52.1.0]

### Changed

- Publish `destinationTransactionCompleted` event when a bridge tx completes on the destination chain ([#6900](https://github.com/MetaMask/core/pull/6900))

## [52.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/bridge-controller` from `^52.0.0` to `^53.0.0` ([#6895](https://github.com/MetaMask/core/pull/6895))
- Bump `@metamask/network-controller` from `^24.2.2` to `^24.3.0` ([#6883](https://github.com/MetaMask/core/pull/6883))
- Bump `@metamask/transaction-controller` from `^60.7.0` to `^60.8.0` ([#6883](https://github.com/MetaMask/core/pull/6883))

### Fixed

- Fix issue with Mobile where app would crash after a successful tx ([#6890](https://github.com/MetaMask/core/pull/6890))
- Fix BridgeController initialization in unit tests ([#6891](https://github.com/MetaMask/core/pull/6891))

## [51.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/bridge-controller` from `^51.0.0` to `^52.0.0` ([#6834](https://github.com/MetaMask/core/pull/6834))

## [50.1.0]

### Changed

- Bump peer dependency `@metamask/bridge-controller` from `^50.0.0` to `^51.0.0` ([#6824](https://github.com/MetaMask/core/pull/6824))

## [50.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/bridge-controller` from `^49.0.0` to `^50.0.0` ([#6818](https://github.com/MetaMask/core/pull/6818))

## [49.0.1]

### Changed

- Bump `@metamask/base-controller` from `^8.4.0` to `^8.4.1` ([#6807](https://github.com/MetaMask/core/pull/6807))
- Bump `@metamask/controller-utils` from `^11.14.0` to `^11.14.1` ([#6807](https://github.com/MetaMask/core/pull/6807))
- Bump `@metamask/polling-controller` from `^14.0.0` to `^14.0.1` ([#6807](https://github.com/MetaMask/core/pull/6807))

## [49.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/bridge-controller` from `^48.0.0` to `^49.0.0` ([#6806](https://github.com/MetaMask/core/pull/6806))

## [48.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/bridge-controller` from `^47.2.0` to `^48.0.0` ([#6780](https://github.com/MetaMask/core/pull/6780))

## [47.2.0]

### Changed

- Make QuoteMetadata optional when calling `submitTx` ([#6739](https://github.com/MetaMask/core/pull/6739))
- Skip event publishing for transactions submitted outside of the Unified Swap and Bridge experience ([#6739](https://github.com/MetaMask/core/pull/6739))
  - On tx submission, add the quote's `featureId` to txHistory
  - When transaction statuses change, check the `featureId` and skip event publishing when it's not `undefined`
  - This affects the Submitted, Completed and Failed events

## [47.1.0]

### Changed

- Bump `@metamask/transaction-controller` from `60.4.0` to `60.5.0` ([#6733](https://github.com/MetaMask/core/pull/6733))

## [47.0.0]

### Changed

- Bump `@metamask/utils` from `^11.8.0` to `^11.8.1` ([#6708](https://github.com/MetaMask/core/pull/6708))
- **BREAKING** Add a required `accountAddress` parameter to the `submitTx` handler ([#6719](https://github.com/MetaMask/core/pull/6719))

### Removed

- Deprecate the unused `SnapConfirmationViewed` event ([#6719](https://github.com/MetaMask/core/pull/6719))

### Fixed

- Replace `AccountsController:getSelectedMultichainAccount` usages with AccountsController:getAccountByAddress` when reading account details required for submitting Solana transactions ([#6719](https://github.com/MetaMask/core/pull/6719))

## [46.0.0]

### Added

- Add support for Bitcoin bridge transactions ([#6705](https://github.com/MetaMask/core/pull/6705))
  - Handle Bitcoin PSBT (Partially Signed Bitcoin Transaction) format in trade data
  - Support Bitcoin transaction submission through unified Snap interface

### Changed

- **BREAKING:** Update transaction submission to use new unified Snap interface for all non-EVM chains ([#6705](https://github.com/MetaMask/core/pull/6705))
  - Replace `signAndSendTransactionWithoutConfirmation` with `ClientRequest:signAndSendTransaction` method for Snap communication
  - This changes the expected Snap interface but maintains backward compatibility through response handling
- Export `handleSolanaTxResponse` as an alias for `handleNonEvmTxResponse` for backward compatibility (deprecated) ([#6705](https://github.com/MetaMask/core/pull/6705))
- Rename `createClientTransactionRequest` from `signAndSendTransactionRequest` for clarity ([#6705](https://github.com/MetaMask/core/pull/6705))

### Removed

- Remove direct dependency on `@metamask/keyring-api` ([#6705](https://github.com/MetaMask/core/pull/6705))

### Fixed

- Fix invalid fallback chain ID for non-EVM chains in transaction metadata ([#6705](https://github.com/MetaMask/core/pull/6705))
  - Changed from invalid `0x0` to `0x1` as temporary workaround for activity list display

## [45.0.0]

### Changed

- Bump `@metamask/bridge-controller` from `^44.0.1` to `^45.0.0` ([#6716](https://github.com/MetaMask/core/pull/6716), [#6629](https://github.com/MetaMask/core/pull/6716))

## [44.1.0]

### Changed

- Revert accidental breaking changes included in v44.0.0 ([#6454](https://github.com/MetaMask/core/pull/6454))
- Refactor `handleLineaDelay` to `handleApprovalDelay` for improved abstraction and add support for Base chain by using an array and `includes` for chain ID checks ([#6674](https://github.com/MetaMask/core/pull/6674))

## [44.0.0] [DEPRECATED]

### Changed

- This version was deprecated because it accidentally included additional breaking changes; use v44.1.0 or later versions instead
- **BREAKING:** Bump peer dependency `@metamask/bridge-controller` from `^43.0.0` to `^44.0.0` ([#6652](https://github.com/MetaMask/core/pull/6652), [#6676](https://github.com/MetaMask/core/pull/6676))

## [43.1.0]

### Added

- Add new controller metadata properties to `BridgeStatusController` ([#6589](https://github.com/MetaMask/core/pull/6589))

### Changed

- Bump `@metamask/controller-utils` from `^11.12.0` to `^11.14.0` ([#6620](https://github.com/MetaMask/core/pull/6620), [#6629](https://github.com/MetaMask/core/pull/6629))
- Bump `@metamask/base-controller` from `^8.3.0` to `^8.4.0` ([#6632](https://github.com/MetaMask/core/pull/6632))

## [43.0.0]

### Changed

- **BREAKING:** Bump `@metamask/bridge-controller` peer dependency from `^42.0.0` to `^43.0.0` ([#6612](https://github.com/MetaMask/core/pull/6612))
- Bump `@metamask/keyring-api` from `^20.1.0` to `^21.0.0` ([#6560](https://github.com/MetaMask/core/pull/6560))
- Bump `@metamask/utils` from `^11.4.2` to `^11.8.0` ([#6588](https://github.com/MetaMask/core/pull/6588))

## [42.0.0]

### Added

- Add `getBridgeHistoryItemByTxMetaId` method available via messaging system for external access to bridge history items ([#6363](https://github.com/MetaMask/core/pull/6363))
- Add `gas_included_7702` field to metrics tracking for EIP-7702 gasless transactions ([#6363](https://github.com/MetaMask/core/pull/6363))

### Changed

- **BREAKING:** Bump `@metamask/bridge-controller` peer dependency from `^41.0.0` to `^42.0.0` ([#6476](https://github.com/MetaMask/core/pull/6476))
- Bump `@metamask/base-controller` from `^8.2.0` to `^8.3.0` ([#6465](https://github.com/MetaMask/core/pull/6465))
- Pass the `isGasFeeIncluded` parameter through transaction utilities ([#6363](https://github.com/MetaMask/core/pull/6363))

## [41.0.0]

### Fixed

- Set the Solana tx signature as the `txHistory` key to support lookups by hash ([#6424](https://github.com/MetaMask/core/pull/6424))
- Read Completed swap properties from `txHistory` for consistency with bridge transactions ([#6424](https://github.com/MetaMask/core/pull/6424))

## [40.2.0]

### Added

- Publish `StatusValidationFailed` event for invalid getTxStatus responses ([#6362](https://github.com/MetaMask/core/pull/6362))

## [40.1.0]

### Changed

- Bump `@metamask/base-controller` from `^8.1.0` to `^8.2.0` ([#6355](https://github.com/MetaMask/core/pull/6355))

## [40.0.0]

### Added

- Add `getBridgeHistoryItemByTxMetaId` method to retrieve bridge history items by their transaction meta ID ([#6346](https://github.com/MetaMask/core/pull/6346))
- Add support for EIP-7702 gasless transactions in transaction batch handling ([#6346](https://github.com/MetaMask/core/pull/6346))

### Changed

- **BREAKING:** Bump peer dependency `@metamask/bridge-controller` from `^40.0.0` to `^41.0.0` ([#6350](https://github.com/MetaMask/core/pull/6350))
- Calculate `actual_time_minutes` event property based on `txMeta.time` if available ([#6314](https://github.com/MetaMask/core/pull/6314))
- Parse event properties from the quote request if an event needs to be published prior to tx submission (i.e., Failed, Submitted) ([#6314](https://github.com/MetaMask/core/pull/6314))
- Update transaction batch handling to conditionally enable EIP-7702 based on quote's `gasless7702` flag ([#6346](https://github.com/MetaMask/core/pull/6346))

## [39.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` from `^32.0.0` to `^33.0.0` ([#6345](https://github.com/MetaMask/core/pull/6345))
- **BREAKING:** Bump peer dependency `@metamask/bridge-controller` from `^39.0.0` to `^40.0.0` ([#6345](https://github.com/MetaMask/core/pull/6345))
- **BREAKING:** Bump peer dependency `@metamask/transaction-controller` from `^59.0.0` to `^60.0.0` ([#6345](https://github.com/MetaMask/core/pull/6345))
- Bump accounts related packages ([#6309](https://github.com/MetaMask/core/pull/6309))
  - Bump `@metamask/keyring-api` from `^20.0.0` to `^20.1.0`

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@67.0.1...HEAD
[67.0.1]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@67.0.0...@metamask/bridge-status-controller@67.0.1
[67.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@66.1.0...@metamask/bridge-status-controller@67.0.0
[66.1.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@66.0.2...@metamask/bridge-status-controller@66.1.0
[66.0.2]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@66.0.1...@metamask/bridge-status-controller@66.0.2
[66.0.1]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@66.0.0...@metamask/bridge-status-controller@66.0.1
[66.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@65.0.1...@metamask/bridge-status-controller@66.0.0
[65.0.1]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@65.0.0...@metamask/bridge-status-controller@65.0.1
[65.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@64.4.5...@metamask/bridge-status-controller@65.0.0
[64.4.5]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@64.4.4...@metamask/bridge-status-controller@64.4.5
[64.4.4]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@64.4.3...@metamask/bridge-status-controller@64.4.4
[64.4.3]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@64.4.2...@metamask/bridge-status-controller@64.4.3
[64.4.2]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@64.4.1...@metamask/bridge-status-controller@64.4.2
[64.4.1]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@64.4.0...@metamask/bridge-status-controller@64.4.1
[64.4.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@64.3.0...@metamask/bridge-status-controller@64.4.0
[64.3.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@64.2.0...@metamask/bridge-status-controller@64.3.0
[64.2.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@64.1.0...@metamask/bridge-status-controller@64.2.0
[64.1.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@64.0.1...@metamask/bridge-status-controller@64.1.0
[64.0.1]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@64.0.0...@metamask/bridge-status-controller@64.0.1
[64.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@63.1.0...@metamask/bridge-status-controller@64.0.0
[63.1.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@63.0.0...@metamask/bridge-status-controller@63.1.0
[63.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@62.0.0...@metamask/bridge-status-controller@63.0.0
[62.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@61.0.0...@metamask/bridge-status-controller@62.0.0
[61.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@60.1.0...@metamask/bridge-status-controller@61.0.0
[60.1.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@60.0.0...@metamask/bridge-status-controller@60.1.0
[60.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@59.0.0...@metamask/bridge-status-controller@60.0.0
[59.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@58.0.0...@metamask/bridge-status-controller@59.0.0
[58.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@57.0.0...@metamask/bridge-status-controller@58.0.0
[57.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@56.0.0...@metamask/bridge-status-controller@57.0.0
[56.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@55.0.0...@metamask/bridge-status-controller@56.0.0
[55.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@54.0.0...@metamask/bridge-status-controller@55.0.0
[54.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@53.0.0...@metamask/bridge-status-controller@54.0.0
[53.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@52.1.0...@metamask/bridge-status-controller@53.0.0
[52.1.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@52.0.0...@metamask/bridge-status-controller@52.1.0
[52.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@51.0.0...@metamask/bridge-status-controller@52.0.0
[51.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@50.1.0...@metamask/bridge-status-controller@51.0.0
[50.1.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@50.0.0...@metamask/bridge-status-controller@50.1.0
[50.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@49.0.1...@metamask/bridge-status-controller@50.0.0
[49.0.1]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@49.0.0...@metamask/bridge-status-controller@49.0.1
[49.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@48.0.0...@metamask/bridge-status-controller@49.0.0
[48.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@47.2.0...@metamask/bridge-status-controller@48.0.0
[47.2.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@47.1.0...@metamask/bridge-status-controller@47.2.0
[47.1.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@47.0.0...@metamask/bridge-status-controller@47.1.0
[47.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@46.0.0...@metamask/bridge-status-controller@47.0.0
[46.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@45.0.0...@metamask/bridge-status-controller@46.0.0
[45.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@44.1.0...@metamask/bridge-status-controller@45.0.0
[44.1.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@44.0.0...@metamask/bridge-status-controller@44.1.0
[44.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@43.1.0...@metamask/bridge-status-controller@44.0.0
[43.1.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@43.0.0...@metamask/bridge-status-controller@43.1.0
[43.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@42.0.0...@metamask/bridge-status-controller@43.0.0
[42.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@41.0.0...@metamask/bridge-status-controller@42.0.0
[41.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@40.2.0...@metamask/bridge-status-controller@41.0.0
[40.2.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@40.1.0...@metamask/bridge-status-controller@40.2.0
[40.1.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@40.0.0...@metamask/bridge-status-controller@40.1.0
[40.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@39.0.0...@metamask/bridge-status-controller@40.0.0
[39.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-status-controller@38.1.0...@metamask/bridge-status-controller@39.0.0
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
