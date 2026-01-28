# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [22.3.0]

### Changed

- Change `client` field type in `SentinelMeta` from `ClientId` enum to `string` for device identification ([#562](https://github.com/MetaMask/smart-transactions-controller/pull/562))

## [22.2.0]

### Added

- Add `Feature`, `Kind`, `Client` and `Wallet` fields to `SentinelMeta` ([#560](https://github.com/MetaMask/smart-transactions-controller/pull/560))

## [22.1.0]

### Added

- Add support for signed transactions with metadata in SmartTransactionsController ([#557](https://github.com/MetaMask/smart-transactions-controller/pull/557))

## [22.0.0]

### Changed

- **BREAKING**: The controller now reads feature flags directly from `RemoteFeatureFlagController` via the messenger instead of using the `getFeatureFlags` callback ([#550](https://github.com/MetaMask/smart-transactions-controller/pull/550))
  - Clients must configure the following as allowed actions in the controller messenger:
    - `RemoteFeatureFlagController:getState`
    - `ErrorReportingService:captureException` (for reporting validation errors to Sentry)
  - Clients must configure `RemoteFeatureFlagController:stateChange` as an allowed event
  - The `getFeatureFlags` constructor option is now deprecated and ignored

## [21.1.0]

### Added

- Add `chainId` parameter to `fetchLiveness` method, allowing direct chain ID specification without requiring a network client ID ([#554](https://github.com/MetaMask/smart-transactions-controller/pull/554))

### Deprecated

- Deprecate `networkClientId` parameter in `fetchLiveness` in favor of `chainId` ([#554](https://github.com/MetaMask/smart-transactions-controller/pull/554))

## [21.0.0]

### Changed

- Mark multiple transactions as failed if a batch smart transaction fails ([#551](https://github.com/MetaMask/smart-transactions-controller/pull/551))
- **BREAKING:** Remove an unnecessary confirmExternalTransaction call ([#548](https://github.com/MetaMask/smart-transactions-controller/pull/548))

## [20.1.0]

### Added

- feat(STX-271): add sentinel URL for Polygon ([#546](https://github.com/MetaMask/smart-transactions-controller/pull/546))

## [20.0.0]

### Changed

- **BREAKING:** Migrate `SmartTransactionsController` to new `Messenger` from `@metamask/messenger` ([#543](https://github.com/MetaMask/smart-transactions-controller/pull/543))
- **BREAKING:** Metadata property `anonymous` renamed to `includeInDebugSnapshot` ([#543](https://github.com/MetaMask/smart-transactions-controller/pull/543))
- **BREAKING:** Bump `@metamask/network-controller` peer dependency from `^24.0.O` to `^25.0.0` ([#543](https://github.com/MetaMask/smart-transactions-controller/pull/543))
- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency from `^60.4.0` to `^61.0.0` ([#543](https://github.com/MetaMask/smart-transactions-controller/pull/543))
- Bump `@metamask/base-controller` from `^8.3.0` to `^9.0.0`([#543](https://github.com/MetaMask/smart-transactions-controller/pull/543))
- Bump `@metamask/polling-controller` from `^14.0.0` to `^15.0.0`([#543](https://github.com/MetaMask/smart-transactions-controller/pull/543))
- Set `moduleResolution` option to `Node16` ([#543](https://github.com/MetaMask/smart-transactions-controller/pull/543))

## [19.2.1]

### Fixed

- Export `SmartTransactionMinedTx`, `SmartTransactionCancellationReason`, `SmartTransactionStatuses`, and `ClientId` enums values instead of types only ([#541](https://github.com/MetaMask/smart-transactions-controller/pull/541))

## [19.2.0]

### Added

- Add missing constants and helpers exports ([#538](https://github.com/MetaMask/smart-transactions-controller/pull/538))
  - `MetaMetricsEventCategory`
  - `MetaMetricsEventName`
  - `getSmartTransactionMetricsProperties`
  - `getSmartTransactionMetricsSensitiveProperties`

## [19.1.0]

### Added

- Add missing exports for types ([#537](https://github.com/MetaMask/smart-transactions-controller/pull/537))
  - `Fee`
  - `Fees`
  - `IndividualTxFees`
  - `FeatureFlags`
  - `SmartTransactionMinedTx`
  - `SmartTransaction`
  - `SmartTransactionCancellationReason`
  - `SmartTransactionStatuses`
  - `ClientId`

## [19.0.0]

### Added

- This package can now be used in ESM environments as well as CommonJS ([#469](https://github.com/MetaMask/smart-transactions-controller/pull/469))
- Add two new controller state metadata properties: `includeInStateLogs` and `usedInUi` ([#531](https://github.com/MetaMask/smart-transactions-controller/pull/531))

### Changed

- **BREAKING:** Disallow subpath exports ([#469](https://github.com/MetaMask/smart-transactions-controller/pull/469))
- **BREAKING:** Upgrade peer dependency `@metamask/transaction-controller` from `^58.0.0` to `^60.4.0` ([#532](https://github.com/MetaMask/smart-transactions-controller/pull/532), [#534](https://github.com/MetaMask/smart-transactions-controller/pull/534))
- **BREAKING:** Remove `getNonceLock`, `confirmExternalTransaction`, `getTransactions`, and `updateTransaction` constructor option in favor of messenger actions ([#534](https://github.com/MetaMask/smart-transactions-controller/pull/534))
  - The messenger is now used to access TransactionController; you must add these actions to the SmartTransactionController messenger allowlist:
    - `TransactionController:getNonceLock`
    - `TransactionController:confirmExternalTransaction`
    - `TransactionController:getTransactions`
    - `TransactionController:updateTransaction`
- Upgrade `@metamask/base-controller` from `^7.0.1` to `^8.3.0` ([#529](https://github.com/MetaMask/smart-transactions-controller/pull/529))
- Upgrade `@metamask/polling-controller` from `^12.0.0` to `^14.0.0` ([#529](https://github.com/MetaMask/smart-transactions-controller/pull/529))

### Removed

- **BREAKING:** Remove default export ([#535](https://github.com/MetaMask/smart-transactions-controller/pull/535))
  - Use `import { SmartTransactionsController } from '@metamask/smart-transactions-controller'` instead.

## [18.1.0]

### Added

- Add Linea URL for Sentinel ([#527](https://github.com/MetaMask/smart-transactions-controller/pull/527))

## [18.0.0]

### Changed

- **BREAKING:**: Don't persist controller state ([#525](https://github.com/MetaMask/smart-transactions-controller/pull/525))

## [17.0.0]

### Added

- Add support for type 4 transaction ([#521](https://github.com/MetaMask/smart-transactions-controller/pull/521))

### Changed

- **BREAKING:** Bump peer dependency on `@metamask/network-controller` to `^24.0.0` ([#519](https://github.com/MetaMask/smart-transactions-controller/pull/519))
- **BREAKING:** Bump dependency and peer dependency on `@metamask/transaction-controller` to `^58.0.0` ([#520](https://github.com/MetaMask/smart-transactions-controller/pull/520))
  - The `confirmExternalTransaction` constructor option now expects to match `TransactionController` from this version
  - The `getNonceLock` constructor option now expects to match `TransactionController` from this version
  - The `getTransactions` constructor option now returns an object that matches `TransactionMeta` from this version
  - The `updateTransaction` constructor option now expects an object that matches `TransactionMeta` from this version
  - The `transactionMeta` option of the `submitSignedTransactions` method now expects an object that matches `TransactionMeta` from this version
  - The `txParams` option of the `submitSignedTransactions` method now expects an object that matches `TransactionParams` from this version

## [16.5.0]

### Added

- Add Arbitrum URL for Sentinel ([#517](https://github.com/MetaMask/smart-transactions-controller/pull/517))

## [16.4.0]

### Added

- Add performance tracing to the STX controller ([#515](https://github.com/MetaMask/smart-transactions-controller/pull/515))

## [16.3.1]

### Fixed

- Improve error handling and monitoring ([#508](https://github.com/MetaMask/smart-transactions-controller/pull/508))

## [16.3.0]

### Added

- Support batch transactions during submit ([#504](https://github.com/MetaMask/smart-transactions-controller/pull/504))

## [16.2.0]

### Added

- Added multi-chain smart transaction support ([#498](https://github.com/MetaMask/smart-transactions-controller/pull/498))

### Fixed

- Improve changelog linting to prevent formatting issues ([#502](https://github.com/MetaMask/smart-transactions-controller/pull/502))

## [16.1.0]

### Added

- Add Base Sentinel endpoint to STX controller ([#500](https://github.com/MetaMask/smart-transactions-controller/pull/500))

### Changed

- Add workflow_dispatch to security-code-scanner ([#499](https://github.com/MetaMask/smart-transactions-controller/pull/499))
- SmartTransactionsController `state` should persist ([#493](https://github.com/MetaMask/smart-transactions-controller/pull/493))
  After opening your browser smart transactions should be preserved.

## [16.0.1]

### Fixed

- Extend definition of when a regular tx is marked as failed based on a smart transaction status, clean up unsupported statuses ([#485](https://github.com/MetaMask/smart-transactions-controller/pull/485))

## [16.0.0]

### Changed

- **BREAKING** Update `@metamask/transaction-controller` peer dependency from `^38.0.0` to `^42.0.0` ([#482](https://github.com/MetaMask/smart-transactions-controller/pull/482))

### Removed

- **BREAKING** Remove exports for `AllowedActions` and `AllowedEvents` types ([#482](https://github.com/MetaMask/smart-transactions-controller/pull/482))

## [15.1.0]

### Changed

- Update constants.ts to add a BSC url for smart transactions ([#483](https://github.com/MetaMask/smart-transactions-controller/pull/483))

### Removed

- Remove unnecessary `events` dependency ([#473](https://github.com/MetaMask/smart-transactions-controller/pull/473))

## [15.0.0]

### Changed

- **BREAKING**: Recategorize controllers as peer dependencies ([#472](https://github.com/MetaMask/smart-transactions-controller/pull/472))
  - The following packages have been removed as dependencies, and added as peer dependencies:
    - `@metamask/network-controller@^22.0.0`
    - `@metamask/transaction-controller@^38.0.0`
  - Note that these versions have also been updated
    - `@metamask/network-controller` updated from v21.1.0 to v22.0.0 ([#471](https://github.com/MetaMask/smart-transactions-controller/pull/471))
    - `@metamask/transaction-controller` updated from v37.3.0 to v38.0.0 ([#471](https://github.com/MetaMask/smart-transactions-controller/pull/471))
- **BREAKING**: Add support for returning a transaction hash asap after a smart transaction is submitted. This requires to pass 3 new parameters when calling the STX controller: `clientId`, `getFeatureFlags` and `updateTransaction` [#467](https://github.com/MetaMask/smart-transactions-controller/pull/467))
- Update `@metamask/polling-controller` from v11.0.0 to v12.0.0 ([#471](https://github.com/MetaMask/smart-transactions-controller/pull/471))
- Remove test-helpers from build ([#459](https://github.com/MetaMask/smart-transactions-controller/pull/459))
- Bump `@metamask/eth-json-rpc-provider` from `^4.1.0` to `^4.1.6` ([#460](https://github.com/MetaMask/smart-transactions-controller/pull/460))

## [14.0.0]

### Changed

- **BREAKING** Update `@metamask/polling-controller` from `^8.0.0` to `^11.0.0` ([#448](https://github.com/MetaMask/smart-transactions-controller/pull/448))
  - `startPollingByNetworkClientId` has been renamed to `startPolling`, accepting a `SmartTransactionsControllerPollingInput` object instead of a string as argument.
- Update `@metamask/transaction-controller` from `^34.0.0` to `^37.3.0` ([#446](https://github.com/MetaMask/smart-transactions-controller/pull/446))
- Update `@metamask/base-controller` from `^6.0.0` to `^7.0.1` ([#448](https://github.com/MetaMask/smart-transactions-controller/pull/448))
- Update `@metamask/network-controller` from `^20.0.0` to `^21.1.0` ([#447](https://github.com/MetaMask/smart-transactions-controller/pull/447))

## [13.2.0]

### Added

- Add metrics events for Receive and Request ([#429](https://github.com/MetaMask/smart-transactions-controller/pull/429))
  - Add `ReceiveRequest` variant to `MetaMetricsEvents` enum
  - Add `Navigation` variant to `MetaMetricsEventCategory` enum

## [13.1.0]

### Changed

- Emit a new "smartTransactionConfirmationDone" event ([#424](https://github.com/MetaMask/smart-transactions-controller/pull/424))
- Use a new API (Sentinel) for a health check ([#411](https://github.com/MetaMask/smart-transactions-controller/pull/411))

## [13.0.0]

### Changed

- **BREAKING:** Updated `SmartTransactionsController` to inherit from `StaticIntervalPollingController` instead of `StaticIntervalPollingControllerV1` ([#397](https://github.com/MetaMask/smart-transactions-controller/pull/397)).
  - The constructor for `SmartTransactionsController` now accepts a single options object instead of three separate arguments, with configuration options merged into this object.
  - `SmartTransactionsController` now requires a `messenger` option (with the corresponding type `SmartTransactionsControllerMessenger` now available).
  - The constructor no longer accepts `onNetworkStateChange`; instead, it subscribes to `NetworkController:stateChange`.
  - The `getNetworkClientById` argument has been removed from the constructor and is now accessed through the messenger.
  - The controller no longer subscribes to its own events; this is now managed via the messenger.
  - Event emission is no longer handled by `EventEmitter`; the messenger is now used for emitting events.
  - The `SmartTransactionsControllerConfig` type has been removed and replaced with `SmartTransactionsControllerOptions`.
  - Added and exported the following types: `SmartTransactionsControllerMessenger`, `SmartTransactionsControllerState`, `SmartTransactionsControllerGetStateAction`, `SmartTransactionsControllerActions`, `SmartTransactionsControllerStateChangeEvent`, `SmartTransactionsControllerSmartTransactionEvent`, and `SmartTransactionsControllerEvents`.

## [12.0.1]

### Changed

- Remove logic for ensuring uniqueness of smart transactions ([#404](https://github.com/MetaMask/smart-transactions-controller/pull/404))
  - This issue has been resolved in production.

### Fixed

- Fix issue where this.ethQuery is sometimes unexpectedly undefined ([#405](https://github.com/MetaMask/smart-transactions-controller/pull/405))

## [12.0.0]

### Changed

- Upgrade @metamask/network-controller from 19.0.0 to 20.0.0 ([#395](https://github.com/MetaMask/smart-transactions-controller/pull/395))
- **BREAKING**: Removed providerConfig from state and provider object from constructor parameters. Instead provider object will be used from selected network client. ([#395](https://github.com/MetaMask/smart-transactions-controller/pull/395))

## [11.0.0]

### Changed

- adapt to eip-1193 provider changes ([#384](https://github.com/MetaMask/smart-transactions-controller/pull/384))
- **BREAKING**: Save new event props to a newly created smart transaction, use both `properties` and `sensitiveProperties` for events. ([#386](https://github.com/MetaMask/smart-transactions-controller/pull/386))([#390](https://github.com/MetaMask/smart-transactions-controller/pull/390))

## [10.2.0]

### Changed

- Update metrics, so events work even for non-swaps transactions ([#374](https://github.com/MetaMask/smart-transactions-controller/pull/374))
- Update @metamask/transaction-controller from 32.0.0 to 34.0.0 ([#371](https://github.com/MetaMask/smart-transactions-controller/pull/371))
- Update braces from 3.0.2 to 3.0.3 and remove the `--immutable-cache` flag in a build file ([#367](https://github.com/MetaMask/smart-transactions-controller/pull/367))

## [10.1.6]

### Changed

- Update @metamask/transaction-controller from 29.1.0 to 32.0.0 ([#348](https://github.com/MetaMask/smart-transactions-controller/pull/348))

## [10.1.5]

### Changed

- Update @metamask/polling-controller from 6.0.2 to 8.0.0 ([#352](https://github.com/MetaMask/smart-transactions-controller/pull/352))

## [10.1.4]

### Changed

- Update @metamask/network-controller from 18.1.1 to 19.0.0 ([#349](https://github.com/MetaMask/smart-transactions-controller/pull/349))
- Update @metamask/base-controller from 5.0.2 to 6.0.0 ([#351](https://github.com/MetaMask/smart-transactions-controller/pull/351))

## [10.1.3]

### Changed

- Update jest from v26 to v29, ts-jest from v26 to v29 and nock from v13 to v14 ([#325](https://github.com/MetaMask/smart-transactions-controller/pull/325))

## [10.1.2]

### Fixed

- fix: Improve state management to ensure unique smart transactions in a rare edge case. This will be removed in a future version once we have confirmed this is resolved. ([#353](https://github.com/MetaMask/smart-transactions-controller/pull/353))
- Bring release instructions in README up to date ([#354](https://github.com/MetaMask/smart-transactions-controller/pull/354))

## [10.1.1]

### Fixed

- Call the "poll" function only once on a network switch ([#348](https://github.com/MetaMask/smart-transactions-controller/pull/348))
- Update `@metamask/transaction-controller` from `^29.1.0` to `^30.0.0` ([#342](https://github.com/MetaMask/smart-transactions-controller/pull/342))

## [10.1.0]

### Changed

- Update `@metamask/transaction-controller` from `^28.1.0` to `^29.1.0` ([#339](https://github.com/MetaMask/smart-transactions-controller/pull/339))

## [10.0.1]

### Fixed

- Emit an event with an updated Smart Transaction before confirmation ([#333](https://github.com/MetaMask/smart-transactions-controller/pull/333))

## [10.0.0]

### Fixed

- **BREAKING**: Flip the behavior of the `wipeSmartTransactions` method's `ignoreNetwork` option ([#323](https://github.com/MetaMask/smart-transactions-controller/pull/323))
  - Passing `false` will now wipe transactions for the globally selected chain, and passing `true` will now wipe transactions from each chain stored in state, instead of the other way around

## [9.0.0]

### Added

- Add Sepolia support ([#316](https://github.com/MetaMask/smart-transactions-controller/pull/316))
- Add function `wipeSmartTransactions` to clear all state for a given address (needs to be supplied in all-lowercase) ([#316](https://github.com/MetaMask/smart-transactions-controller/pull/316))

### Changed

- Update `@metamask/base-controller` from `^4.1.1` to `^5.0.1` ([#296](https://github.com/MetaMask/smart-transactions-controller/pull/296))
- Update `@metamask/controller-utils` from `^8.0.3` to `^9.1.0` ([#318](https://github.com/MetaMask/smart-transactions-controller/pull/318))
- Update `@metamask/network-controller` from `^17.2.0` to `^18.1.0` ([#310](https://github.com/MetaMask/smart-transactions-controller/pull/310))
- Update `@metamask/polling-controller` from `^5.0.1` to `^6.0.1` ([#294](https://github.com/MetaMask/smart-transactions-controller/pull/294))
- Update `@metamask/transaction-controller` from `^25.1.0` to `^28.1.0` ([#319](https://github.com/MetaMask/smart-transactions-controller/pull/319))

### Removed

- **BREAKING**: Remove Goerli support ([#316](https://github.com/MetaMask/smart-transactions-controller/pull/316))

## [8.1.0]

### Changed

- Update a URL for transaction-api from `https://transaction.metaswap.codefi.network` to `https://transaction.api.cx.metamask.io`, since we shouldn't be using `codefi.network` anymore ([#314](https://github.com/MetaMask/smart-transactions-controller/pull/314))
- Add a new function called `getSmartTransactionByMinedTxHash`, which can be used to get a smart transaction by its `minedHash` prop ([#314](https://github.com/MetaMask/smart-transactions-controller/pull/314))
- Add new props on the `SmartTransactionsStatus` type, so they can be used e.g. as event props ([#314](https://github.com/MetaMask/smart-transactions-controller/pull/314))

## [8.0.0]

### Changed

- **BREAKING:** The constructor now requires a `getTransactions` option, which can be used to get a list of existing transactions ([#301](https://github.com/MetaMask/smart-transactions-controller/pull/301))
- Ensure that a transaction does not get re-confirmed if it is already confirmed or submitted. MetaMask Swaps are confirmed from this controller, other transaction types are most of the time confirmed from the TransactionController. ([#301](https://github.com/MetaMask/smart-transactions-controller/pull/301))

## [7.0.0]

### Added

- **BREAKING:** Track fees and liveness for multiple chains by adding `feesByChainId` and `livenessByChainId` properties to SmartTransactionsControllerState ([#237](https://github.com/MetaMask/smart-transactions-controller/pull/237))
  - In particular, clients should prefer accessing `feesByChainId` and `livenessByChainId` instead of `fees` and `liveness`, which will be removed in a future major version.
- `SmartTransactionsController` now inherits from `StaticIntervalPollingControllerV1` ([#237](https://github.com/MetaMask/smart-transactions-controller/pull/237), [#265](https://github.com/MetaMask/smart-transactions-controller/pull/265))
  - This change introduces a set of public methods to the controller which is designed to manage polling on a particular network instead of the globally selected network. Internally, `updateSmartTransactions` will still be called as the legacy polling does. The methods added are:
    - `setIntervalLength`
    - `getIntervalLength`
    - `startPollingByNetworkClientId`
    - `stopAllPolling`
    - `stopPollingByPollingToken`
    - `onPollingCompleteByNetworkClientId`
- Validation can be now be circumvented by passing the `skipConfirm` option ([#271](https://github.com/MetaMask/smart-transactions-controller/pull/271))
- Several methods now take a `networkClientId` option within an options object which can be used to operate on smart transactions that live on a particular chain instead of the globally selected one ([#237](https://github.com/MetaMask/smart-transactions-controller/pull/237))
  - `updateSmartTransaction`
  - `fetchSmartTransactionsStatus`
  - `getFees`
  - `submitSignedTransactions`
  - `cancelSmartTransaction`
  - `fetchLiveness`
- Expose `eventEmitter` as a public property ([#298](https://github.com/MetaMask/smart-transactions-controller/pull/298))
- `submitSignedTransactions` now takes a `transactionMeta` option which is used to set the `type` of the submitted smart transaction ([#298](https://github.com/MetaMask/smart-transactions-controller/pull/298))
- `submitSignedTransactions` now sets `uuid` and `txHash` on the submitted smart transaction ([#298](https://github.com/MetaMask/smart-transactions-controller/pull/298))
- `submitSignedTransactions` now returns metadata about the submitted transaction ([#298](https://github.com/MetaMask/smart-transactions-controller/pull/298))
- Add `getTxHash` utility function which can be used to get the transaction hash from a signed transaction ([#298](https://github.com/MetaMask/smart-transactions-controller/pull/298))
- `<transaction-uuid>:smartTransaction` is now emitted whenever a smart transaction is updated ([#298](https://github.com/MetaMask/smart-transactions-controller/pull/298))
  - This occurs after transactions are submitted, after they are confirmed, after statuses are updated, and also explicitly via `updateSmartTransaction`.

### Changed

- **BREAKING**: Bump `@metamask/network-controller` from `^15.0.0` to `^17.0.0` ([#238](https://github.com/MetaMask/smart-transactions-controller/pull/238) [#241](https://github.com/MetaMask/smart-transactions-controller/pull/241))
  - This is breaking because the type of the `messenger` has backward-incompatible changes. See the changelog for `@metamask/base-controller@4.0.0` for more.
- **BREAKING**: The set of supported chains (configurable via `supportedChainIds`) now defaults to including Goerli instead of Rinkeby ([#237](https://github.com/MetaMask/smart-transactions-controller/pull/237))
- **BREAKING**: Minimum Node.js version is now 18.18 ([#270](https://github.com/MetaMask/smart-transactions-controller/pull/270))
- **BREAKING:** Constrain the type of the constructor `provider` option to `Provider` from `@metamask/network-controller` ([#237](https://github.com/MetaMask/smart-transactions-controller/pull/237))
- **BREAKING:** The constructor now takes a required argument `getNetworkClientById`, which should be bound from NetworkController's `getNetworkClientById` method ([#237](https://github.com/MetaMask/smart-transactions-controller/pull/237))
- **BREAKING:** `fetchSmartTransactionsStatus` now emits `<transaction-uuid>:smartTransaction` instead of `<transaction-uuid>:transaction-hash` ([#279](https://github.com/MetaMask/smart-transactions-controller/pull/279))
  - This event contains more information than just the transaction hash.
  - This event is also always emitted even if there is no transaction hash.
- **BREAKING:** Use a category of "Transactions" for MetaMetrics events rather than "swaps" ([#282](https://github.com/MetaMask/smart-transactions-controller/pull/282))
- Bump `@metamask/base-controller` from `^3.2.1` to `^4.0.0` ([#237](https://github.com/MetaMask/smart-transactions-controller/pull/237))
- Bump `@metamask/controller-utils` from `^5.0.0` to `^8.0.3` ([#242](https://github.com/MetaMask/smart-transactions-controller/pull/242) [#244](https://github.com/MetaMask/smart-transactions-controller/pull/244))([#242](https://github.com/MetaMask/smart-transactions-controller/pull/242)) ([#244](https://github.com/MetaMask/smart-transactions-controller/pull/244)) ([#267](https://github.com/MetaMask/smart-transactions-controller/pull/267)) ([#272](https://github.com/MetaMask/smart-transactions-controller/pull/272))
- Bump `@metamask/network-controller` from `^15.2.0` to `^17.2.0` ([#238](https://github.com/MetaMask/smart-transactions-controller/pull/238)) ([#241](https://github.com/MetaMask/smart-transactions-controller/pull/241)) ([#255](https://github.com/MetaMask/smart-transactions-controller/pull/255)) ([#264](https://github.com/MetaMask/smart-transactions-controller/pull/264)) ([#265](https://github.com/MetaMask/smart-transactions-controller/pull/265))
- Bump `@metamask/polling-controller` from `^2.0.0` to `^5.0.0` ([#265](https://github.com/MetaMask/smart-transactions-controller/pull/265))
- Remove `@ethersprovider/bignumber` and `@ethersproject/providers` from dependencies; replace with `@metamask/eth-query@^4.0.0` ([#237](https://github.com/MetaMask/smart-transactions-controller/pull/237))
- Add `events@^3.3.0` as a dependency ([#271](https://github.com/MetaMask/smart-transactions-controller/pull/271))
- Deprecate `time` property on `SmartTransaction` type in favor of `creationTime` ([#298](https://github.com/MetaMask/smart-transactions-controller/pull/298))

### Removed

- **BREAKING:** Remove property `ethersProvider` from `SmartTransactionsController` ([#237](https://github.com/MetaMask/smart-transactions-controller/pull/237))

### Fixed

- Fix `getFees` so that it does not blow away an existing `nonce` on the trade transaction ([#271](https://github.com/MetaMask/smart-transactions-controller/pull/271))
- Fix `submitSignedTransactions` so that it sets a `nonce` on the resulting transaction if it doesn't have one ([#271](https://github.com/MetaMask/smart-transactions-controller/pull/271))
- Fix updating a smart transaction to no longer throw when no smart transactions have been previously saved under the current chain ([#271](https://github.com/MetaMask/smart-transactions-controller/pull/271))
- Properly override controller name to `SmartTransactionController` ([#273](https://github.com/MetaMask/smart-transactions-controller/pull/273))
- Properly mark `getFees` as having an optional second argument, since it was being handled that way anyway ([#271](https://github.com/MetaMask/smart-transactions-controller/pull/271))
- The controller now waits until the first NetworkController update before making use of the `provider` constructor argument to hit the currently selected network ([#274](https://github.com/MetaMask/smart-transactions-controller/pull/274))
  - This change was made because in the future, the `provider` may no longer be defined initially.
  - This change may cause errors to be thrown immediately following a network switch until a future NetworkController state update or polling iteration.

## [6.2.2]

### Fixed

- Revert "Parameterize SmartTransactionsController state by ChainId for MultiChain + Integrate PollingController Mixin ([#235](https://github.com/MetaMask/smart-transactions-controller/pull/235))

## [6.2.1] [DEPRECATED]

### Fixed

- Fix a typo in a URL for submitting transactions ([#230](https://github.com/MetaMask/smart-transactions-controller/pull/230))

## [6.2.0] [DEPRECATED]

### Added

- Pass current version of this package to API when submitting transactions ([#227](https://github.com/MetaMask/smart-transactions-controller/pull/227))

## [6.1.0] [DEPRECATED]

### Added

- Add a new "userOptInV2" prop ([#222](https://github.com/MetaMask/smart-transactions-controller/pull/222))

### Changed

- Bump @metamask/network-controller from 15.0.0 to 15.1.0 ([#219](https://github.com/MetaMask/smart-transactions-controller/pull/219))

## [6.0.0] [DEPRECATED]

### Added

- **BREAKING:** `getNetworkClientById` is now required argument in constructor options object ([#210](https://github.com/MetaMask/smart-transactions-controller/pull/210))
- Integrate `PollingController` mixin and `_executePoll` method used for concurrent multichain polling ([#210](https://github.com/MetaMask/smart-transactions-controller/pull/210))
- Consumers can now call `startPollingByNetworkClientId` with a networkClientId to start polling for a specific chain and `stopPollingByPollingToken` with the returned pollingToken to stop polling for that chain.

### Changed

- **BREAKING**: Bump `@metamask/network-controller` from ^13.0.1 to ^15.0.0 ([#211](https://github.com/MetaMask/smart-transactions-controller/pull/211))
- **BREAKING**: Replace `@ethersproject/providers` with `@metamask/eth-query` ([#210](https://github.com/MetaMask/smart-transactions-controller/pull/210))
- Remove `@ethersproject/bignumber` ([#210](https://github.com/MetaMask/smart-transactions-controller/pull/210))
- Add optional options object containing a `networkClientId` argument to the `updateSmartTransaction` method ([#210](https://github.com/MetaMask/smart-transactions-controller/pull/210))

## [5.0.0]

### Changed

- Bump dependency on `@metamask/network-controller` to ^13.0.0 ([#191](https://github.com/MetaMask/smart-transactions-controller/pull/191))
- Bump dependency on `@metamask/base-controller` to ^3.2.1 ([#191](https://github.com/MetaMask/smart-transactions-controller/pull/191))
- Bump dependency on `@metamask/controller-utils` to ^5.0.0 ([#191](https://github.com/MetaMask/smart-transactions-controller/pull/191))

### Removed

- **BREAKING:** Remove `metamaskNetworkId` from smart transaction state ([#191](https://github.com/MetaMask/smart-transactions-controller/pull/191))
  - To migrate, remove references to `TransactionMeta.metamaskNetworkId` and `TransactionMeta.history.metamaskNetworkId`
- Remove `getNetwork` from constructor options ([#191](https://github.com/MetaMask/smart-transactions-controller/pull/191))

## [4.0.0]

### Changed

- **BREAKING**: Bump minimum Node.js version to v16 ([#161](https://github.com/MetaMask/smart-transactions-controller/pull/161))
- **BREAKING:** Remove `isomorphic-fetch` ([#131](https://github.com/MetaMask/smart-transactions-controller/pull/131))
  - Projects lacking `fetch` will now have to supply their own polyfill.
- Update `metamask/*` dependencies ([#131](https://github.com/MetaMask/smart-transactions-controller/pull/131)), ([#172](https://github.com/MetaMask/smart-transactions-controller/pull/172))
- Move `@types/lodash` to devDependencies ([#141](https://github.com/MetaMask/smart-transactions-controller/pull/141))

## [3.1.0]

### Changed

- Replace use of full `@metamask/controllers` repo with packages from `@metamask/core-monorepo` ([#110](https://github.com/MetaMask/smart-transactions-controller/pull/110), [#112](https://github.com/MetaMask/smart-transactions-controller/pull/112), [#113](https://github.com/MetaMask/smart-transactions-controller/pull/113))

## [3.0.0]

### Changed

- **BREAKING:** Bump required Node version to v14 ([#90](https://github.com/MetaMask/smart-transactions-controller/pull/90))
- `@metamask/controllers@32.0.2` ([#104](https://github.com/MetaMask/smart-transactions-controller/pull/104))

### Fixed

- Ensure the nonce lock is always released ([#108](https://github.com/MetaMask/smart-transactions-controller/pull/108))

## [2.3.2]

### Changed

- Replace `ethers` with submodules (@ethersproject/bignumber,@ethersproject/bytes, @ethersproject/providers,) - no functional change ([#95](https://github.com/MetaMask/smart-transactions-controller/pull/95))

## [2.3.1]

### Changed

- Remove unnecessary event props ([#93](https://github.com/MetaMask/smart-transactions-controller/pull/93))
- Update `is-release` filter ([#91](https://github.com/MetaMask/smart-transactions-controller/pull/91))
- update is-release filter ([#89](https://github.com/MetaMask/smart-transactions-controller/pull/89))
- use `MetaMask/action-is-release@v1.0` ([#88](https://github.com/MetaMask/smart-transactions-controller/pull/88))
- add config for MetaMask/action-npm-publish ([#85](https://github.com/MetaMask/smart-transactions-controller/pull/85))

## [2.3.0]

### Added

- Add the "clearFees" function ([#84](https://github.com/MetaMask/smart-transactions-controller/pull/84))

## [2.2.0]

### Changed

- chore(deps): bump @metamask/controllers from 30.0.0 to 30.1.0 ([#81](https://github.com/MetaMask/smart-transactions-controller/pull/81))
- chore(deps-dev): bump @metamask/eslint-config-nodejs from 8.0.0 to 9.0.0 ([#80](https://github.com/MetaMask/smart-transactions-controller/pull/80))
- chore(deps-dev): bump @metamask/auto-changelog from 2.6.0 to 2.6.1 ([#79](https://github.com/MetaMask/smart-transactions-controller/pull/79))
- Return all error props in an error response ([#82](https://github.com/MetaMask/smart-transactions-controller/pull/82))

## [2.1.0]

### Added

- chore(deps): bump @metamask/controllers from 29.0.1 to 30.0.0 ([#75](https://github.com/MetaMask/smart-transactions-controller/pull/75))
- chore(deps-dev): bump @metamask/auto-changelog from 2.5.0 to 2.6.0 ([#71](https://github.com/MetaMask/smart-transactions-controller/pull/71))
- Return a pending status for a cancelled tx that hasn't been settled yet ([#74](https://github.com/MetaMask/smart-transactions-controller/pull/74))

## [2.0.1]

### Changed

- Previous version deprecated due to missing build files. No code changes made.

## [2.0.0] [DEPRECATED]

### Added

- "estimateGas" -> "getFees", support a new cancellation reason, refactoring ([#69](https://github.com/MetaMask/smart-transactions-controller/pull/69))
- chore(deps): bump @metamask/controllers from 28.0.0 to 29.0.1 ([#68](https://github.com/MetaMask/smart-transactions-controller/pull/68))
- If mined status is not mined and cancel reason not set, then show the cancel link, refactoring ([#66](https://github.com/MetaMask/smart-transactions-controller/pull/66))
- chore(deps): bump @metamask/controllers from 27.1.1 to 28.0.0 ([#65](https://github.com/MetaMask/smart-transactions-controller/pull/65))

## [1.10.0]

### Added

- Handle the "cancelled" status, lower status polling interval from 10s to 5s, don't mark a tx as cancelled immediately, track uuid ([#63](https://github.com/MetaMask/smart-transactions-controller/pull/63))
- chore(deps): bump @metamask/controllers from 25.1.0 to 27.1.1 ([#62](https://github.com/MetaMask/smart-transactions-controller/pull/62))
- Add tracking of the "current_stx_enabled" param ([#58](https://github.com/MetaMask/smart-transactions-controller/pull/58))

## [1.9.1]

### Added

- Use the "confirmExternalTransaction" fn directly ([#56](https://github.com/MetaMask/smart-transactions-controller/pull/56))

## [1.9.0]

### Added

- Only accept the "getNonceLock" fn and not the whole "nonceTracker" ([#54](https://github.com/MetaMask/smart-transactions-controller/pull/54))

## [1.8.0]

### Added

- Do not update an STX which doesn't exist anymore, add UTs ([#52](https://github.com/MetaMask/smart-transactions-controller/pull/52))

## [1.7.0]

### Added

- Fix UTs, change threshold ([#49](https://github.com/MetaMask/smart-transactions-controller/pull/49))

## [1.6.0]

### Added

- Change cancellable interval to be 1 minute ([#47](https://github.com/MetaMask/smart-transactions-controller/pull/47))
- Estimate approval transaction along with swaps transaction ([#46](https://github.com/MetaMask/smart-transactions-controller/pull/46))
- chore(deps): bump @metamask/controllers from 20.1.0 to 25.1.0 ([#44](https://github.com/MetaMask/smart-transactions-controller/pull/44))
- Add support for approveTxParams ([#45](https://github.com/MetaMask/smart-transactions-controller/pull/45))
- Add method for estimateGas ([#43](https://github.com/MetaMask/smart-transactions-controller/pull/43))

## [1.5.0]

### Added

- Add "fees" and "liveness" into the smartTransactionsState, update version ([#41](https://github.com/MetaMask/smart-transactions-controller/pull/41))

## [1.4.0]

### Added

- Add isomorphic-fetch to stx controller ([#38](https://github.com/MetaMask/smart-transactions-controller/pull/38))
- feat: create new handleFetch with custom error handling ([#35](https://github.com/MetaMask/smart-transactions-controller/pull/35))
- Unblock submit if ethers errors ([#30](https://github.com/MetaMask/smart-transactions-controller/pull/30))
- Parse chain ids from hex to dec instead of mapping them ([#31](https://github.com/MetaMask/smart-transactions-controller/pull/31))
- chore(deps): bump @metamask/controllers from 20.0.0 to 20.1.0 ([#28](https://github.com/MetaMask/smart-transactions-controller/pull/28))
- getTransactions -> getFees, refactoring ([#27](https://github.com/MetaMask/smart-transactions-controller/pull/27))
- chore(deps): bump @metamask/controllers from 19.0.0 to 20.0.0 ([#24](https://github.com/MetaMask/smart-transactions-controller/pull/24))
- Switch license with MetaMask license ([#25](https://github.com/MetaMask/smart-transactions-controller/pull/25))

## [1.3.0]

### Added

- Use the production version of the Transaction APIs repo ([#37](https://github.com/MetaMask/smart-transactions-controller/pull/37))

## [1.2.0]

### Added

- Add more unit tests for SmartTransactionsController ([#23](https://github.com/MetaMask/smart-transactions-controller/pull/23))
- chore(deps): bump @metamask/controllers from 16.0.0 to 19.0.0 ([#18](https://github.com/MetaMask/smart-transactions-controller/pull/18))
- Add cancelled status to stx after successful cancel request ([#21](https://github.com/MetaMask/smart-transactions-controller/pull/21))
- 1.1.0 ([#22](https://github.com/MetaMask/smart-transactions-controller/pull/22))

## [1.1.0]

### Added

- Tracking of STX status changes ([#20](https://github.com/MetaMask/smart-transactions-controller/pull/20))
- Remove cancelled transaction when new trx with same nonce submitted ([#19](https://github.com/MetaMask/smart-transactions-controller/pull/19))
- chore: modify polling and clean up tests ([#17](https://github.com/MetaMask/smart-transactions-controller/pull/17))
- State changes + getTransactions fn ([#16](https://github.com/MetaMask/smart-transactions-controller/pull/16))
- Add updatedTxParams and confirm history event ([#15](https://github.com/MetaMask/smart-transactions-controller/pull/15))
- Smart Transactions List ([#13](https://github.com/MetaMask/smart-transactions-controller/pull/13))

## [1.0.0]

### Added

- Adds nonce to a tx, adds `yarn build:link` support, updates functions for API calls, refactoring ([#8](https://github.com/MetaMask/smart-transactions-controller/pull/8))
- Add many unit tests, support for the batch_status API, refactoring ([#6](https://github.com/MetaMask/smart-transactions-controller/pull/6))
- Bump @metamask/controllers from 15.1.0 to 16.0.0
- Bump @metamask/controllers from 15.0.0 to 15.1.0 ([#4](https://github.com/MetaMask/smart-transactions-controller/pull/4))
- Add initial methods ([#3](https://github.com/MetaMask/smart-transactions-controller/pull/3))
- Add initial SmartTransactionsController ([#1](https://github.com/MetaMask/smart-transactions-controller/pull/1))
- Initial commit

[Unreleased]: https://github.com/MetaMask/smart-transactions-controller/compare/v22.3.0...HEAD
[22.3.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v22.2.0...v22.3.0
[22.2.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v22.1.0...v22.2.0
[22.1.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v22.0.0...v22.1.0
[22.0.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v21.1.0...v22.0.0
[21.1.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v21.0.0...v21.1.0
[21.0.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v20.1.0...v21.0.0
[20.1.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v20.0.0...v20.1.0
[20.0.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v19.2.1...v20.0.0
[19.2.1]: https://github.com/MetaMask/smart-transactions-controller/compare/v19.2.0...v19.2.1
[19.2.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v19.1.0...v19.2.0
[19.1.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v19.0.0...v19.1.0
[19.0.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v18.1.0...v19.0.0
[18.1.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v18.0.0...v18.1.0
[18.0.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v17.0.0...v18.0.0
[17.0.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v16.5.0...v17.0.0
[16.5.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v16.4.0...v16.5.0
[16.4.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v16.3.1...v16.4.0
[16.3.1]: https://github.com/MetaMask/smart-transactions-controller/compare/v16.3.0...v16.3.1
[16.3.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v16.2.0...v16.3.0
[16.2.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v16.1.0...v16.2.0
[16.1.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v16.0.1...v16.1.0
[16.0.1]: https://github.com/MetaMask/smart-transactions-controller/compare/v16.0.0...v16.0.1
[16.0.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v15.1.0...v16.0.0
[15.1.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v15.0.0...v15.1.0
[15.0.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v14.0.0...v15.0.0
[14.0.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v13.2.0...v14.0.0
[13.2.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v13.1.0...v13.2.0
[13.1.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v13.0.0...v13.1.0
[13.0.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v12.0.1...v13.0.0
[12.0.1]: https://github.com/MetaMask/smart-transactions-controller/compare/v12.0.0...v12.0.1
[12.0.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v11.0.0...v12.0.0
[11.0.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v10.2.0...v11.0.0
[10.2.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v10.1.6...v10.2.0
[10.1.6]: https://github.com/MetaMask/smart-transactions-controller/compare/v10.1.5...v10.1.6
[10.1.5]: https://github.com/MetaMask/smart-transactions-controller/compare/v10.1.4...v10.1.5
[10.1.4]: https://github.com/MetaMask/smart-transactions-controller/compare/v10.1.3...v10.1.4
[10.1.3]: https://github.com/MetaMask/smart-transactions-controller/compare/v10.1.2...v10.1.3
[10.1.2]: https://github.com/MetaMask/smart-transactions-controller/compare/v10.1.1...v10.1.2
[10.1.1]: https://github.com/MetaMask/smart-transactions-controller/compare/v10.1.0...v10.1.1
[10.1.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v10.0.1...v10.1.0
[10.0.1]: https://github.com/MetaMask/smart-transactions-controller/compare/v10.0.0...v10.0.1
[10.0.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v9.0.0...v10.0.0
[9.0.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v8.1.0...v9.0.0
[8.1.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v8.0.0...v8.1.0
[8.0.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v7.0.0...v8.0.0
[7.0.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v6.2.2...v7.0.0
[6.2.2]: https://github.com/MetaMask/smart-transactions-controller/compare/v6.2.1...v6.2.2
[6.2.1]: https://github.com/MetaMask/smart-transactions-controller/compare/v6.2.0...v6.2.1
[6.2.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v6.1.0...v6.2.0
[6.1.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v6.0.0...v6.1.0
[6.0.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v5.0.0...v6.0.0
[5.0.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v4.0.0...v5.0.0
[4.0.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v3.1.0...v4.0.0
[3.1.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v3.0.0...v3.1.0
[3.0.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v2.3.2...v3.0.0
[2.3.2]: https://github.com/MetaMask/smart-transactions-controller/compare/v2.3.1...v2.3.2
[2.3.1]: https://github.com/MetaMask/smart-transactions-controller/compare/v2.3.0...v2.3.1
[2.3.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v2.2.0...v2.3.0
[2.2.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v2.0.1...v2.1.0
[2.0.1]: https://github.com/MetaMask/smart-transactions-controller/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v1.10.0...v2.0.0
[1.10.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v1.9.1...v1.10.0
[1.9.1]: https://github.com/MetaMask/smart-transactions-controller/compare/v1.9.0...v1.9.1
[1.9.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v1.8.0...v1.9.0
[1.8.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/MetaMask/smart-transactions-controller/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/MetaMask/smart-transactions-controller/releases/tag/v1.0.0
