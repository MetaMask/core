# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [6.0.0]
### Uncategorized
- Add messenger to transaction controller ([#1241](https://github.com/MetaMask/core/pull/1241))
- Update chain ID format ([#1367](https://github.com/MetaMask/core/pull/1367))
- Replace hard-coded `chainId` on incoming token transactions ([#1366](https://github.com/MetaMask/core/pull/1366))
- Replace `NetworksChainId` constant with `ChainId` ([#1354](https://github.com/MetaMask/core/pull/1354))
- Widen format of networkDetails ([#1326](https://github.com/MetaMask/core/pull/1326))
- Refine NetworkController BlockTracker type ([#1303](https://github.com/MetaMask/core/pull/1303))
- Add eth-query types ([#1266](https://github.com/MetaMask/core/pull/1266))
- BREAKING: Bump to Node 16 ([#1262](https://github.com/MetaMask/core/pull/1262))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@6.0.0...HEAD
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@5.0.0...@metamask/transaction-controller@6.0.0
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@4.0.1...@metamask/transaction-controller@5.0.0
[4.0.1]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@4.0.0...@metamask/transaction-controller@4.0.1
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@3.0.0...@metamask/transaction-controller@4.0.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@2.0.0...@metamask/transaction-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/transaction-controller@1.0.0...@metamask/transaction-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/transaction-controller@1.0.0
