# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [10.0.0]
### Added
- Add `submittedTime` to transaction meta ([#1645](https://github.com/MetaMask/core/pull/1645))
- Add support for actionId ([#1582](https://github.com/MetaMask/core/pull/1582))
- Add name controller ([#1647](https://github.com/MetaMask/core/pull/1647))

### Changed
- **BREAKING**: Rename `rawTransaction` to `rawTx` in the transaction metadata ([#1624](https://github.com/MetaMask/core/pull/1624))
- Support confirming of external transactions in `TransactionController`  ([#1625](https://github.com/MetaMask/core/pull/1625))

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
  - Previously this controller would get the next nonce by calling `eth_getTransactionCount` with a block reference of `pending`.  The next nonce would then be returned from our middleware (within `web3-provider-engine`).
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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@10.0.0...HEAD
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
