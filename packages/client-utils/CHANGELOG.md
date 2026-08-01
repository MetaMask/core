# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Prefer the subject's fungible `from` movement when mapping keyring send activity, so multi-party Solana txs (e.g. bridge source legs) no longer surface another address's token as the sent asset ([#9749](https://github.com/MetaMask/core/pull/9749))

### Changed

- Bump `@metamask/core-backend` from `^8.0.0` to `^8.1.0` ([#9735](https://github.com/MetaMask/core/pull/9735))
- Bump `@metamask/transaction-controller` from `^69.3.0` to `^69.4.0` ([#9735](https://github.com/MetaMask/core/pull/9735))

## [1.5.0]

### Added

- Add `@metamask/slip44` dependency for native token symbol lookup ([#9701](https://github.com/MetaMask/core/pull/9701))

### Changed

- Restore native `assetId` on activity tokens and network fees when a symbol is available, using `@metamask/slip44` symbol lookup instead of the removed chain registry ([#9701](https://github.com/MetaMask/core/pull/9701))
  - Native tokens from indexed value transfers use the transfer symbol
  - Local native tokens and fees include slip44 `assetId` only when a native symbol is already present on the mapped data
  - API network fees derive the symbol from native value transfers when present
  - `assetId` is still omitted when no symbol is available (for example ERC-20-only transactions with no native transfer)

## [1.4.0]

### Added

- Add `mapRampsOrder` for mapping ramps buy/sell orders into the shared activity item shape, and add `rampBuy`/`rampSell` to `ActivityKind` and `ActivityItem` ([#9650](https://github.com/MetaMask/core/pull/9650))

## [1.3.1]

### Changed

- Bump `@metamask/core-backend` from `^7.0.0` to `^8.0.0` ([#9693](https://github.com/MetaMask/core/pull/9693))
- Bump `@metamask/transaction-controller` from `^69.2.1` to `^69.3.0` ([#9693](https://github.com/MetaMask/core/pull/9693))

## [1.3.0]

### Added

- Add optional `assetType` (`'native' | 'erc20' | 'erc721' | 'erc1155'`) on `TokenAmount` and `Fee` so clients can resolve icons when `assetId` is absent ([#9671](https://github.com/MetaMask/core/pull/9671))

### Changed

- Stop inventing native token metadata in activity mappers ([#9671](https://github.com/MetaMask/core/pull/9671))
  - Remove the hardcoded `nativeAssetsByCaipChainId` lookup and the `STANDARD` assume-native fallback
  - `formatAddressToAssetId` returns `undefined` for native sentinel addresses instead of `erc20:0x0`
  - Network fees and native tokens no longer invent `symbol` / slip44 `assetId`
- Bump `@metamask/keyring-api` from `^23.5.0` to `^23.7.0` ([#9676](https://github.com/MetaMask/core/pull/9676))

## [1.2.1]

### Changed

- Bump `@metamask/transaction-controller` from `^69.0.0` to `^69.2.1` ([#9568](https://github.com/MetaMask/core/pull/9568), [#9589](https://github.com/MetaMask/core/pull/9589), [#9593](https://github.com/MetaMask/core/pull/9593))
- Bump `@metamask/core-backend` from `^6.5.0` to `^7.0.0` ([#9593](https://github.com/MetaMask/core/pull/9593))

## [1.2.0]

### Added

- Add `createFormatters` factory with shared display formatters (`formatNumber`, `formatCurrency`, `formatCurrencyCompact`, `formatCurrencyWithMinThreshold`, `formatCurrencyTokenPrice`, `formatToken`, `formatTokenQuantity`, `formatTokenAmount`, `formatPercentWithMinThreshold`, `formatCompact`, `formatDateTime`) ([#9504](https://github.com/MetaMask/core/pull/9504))

## [1.1.0]

### Added

- Map `assetActivation` and `assetDeactivation` activity types in transaction activity mappers ([#9440](https://github.com/MetaMask/core/pull/9440))

### Changed

- Bump `@metamask/transaction-controller` from `^68.3.0` to `^69.0.0` ([#9456](https://github.com/MetaMask/core/pull/9456), [#9470](https://github.com/MetaMask/core/pull/9470))

## [1.0.0]

### Added

- Initial release of the `@metamask/client-utils` package for functions and utilities shared across MetaMask clients (extension and mobile) ([#9375](https://github.com/MetaMask/core/pull/9375))
- Add transaction activity mappers and shared activity types ([#9376](https://github.com/MetaMask/core/pull/9376))
  - `mapApiTransaction` for mapping EVM API transactions to activity items
  - `mapKeyringTransaction` for mapping keyring transactions to activity items
  - `mapLocalTransaction` for mapping local transaction groups to activity items
  - Shared activity types (`ActivityItem`, `ActivityKind`, `Status`, etc.)

### Changed

- Bump `@metamask/transaction-controller` from `^68.2.2` to `^68.3.0` ([#9421](https://github.com/MetaMask/core/pull/9421))
- Bump `@metamask/keyring-api` from `^23.3.0` to `^23.5.0` ([#9390](https://github.com/MetaMask/core/pull/9390))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/client-utils@1.5.0...HEAD
[1.5.0]: https://github.com/MetaMask/core/compare/@metamask/client-utils@1.4.0...@metamask/client-utils@1.5.0
[1.4.0]: https://github.com/MetaMask/core/compare/@metamask/client-utils@1.3.1...@metamask/client-utils@1.4.0
[1.3.1]: https://github.com/MetaMask/core/compare/@metamask/client-utils@1.3.0...@metamask/client-utils@1.3.1
[1.3.0]: https://github.com/MetaMask/core/compare/@metamask/client-utils@1.2.1...@metamask/client-utils@1.3.0
[1.2.1]: https://github.com/MetaMask/core/compare/@metamask/client-utils@1.2.0...@metamask/client-utils@1.2.1
[1.2.0]: https://github.com/MetaMask/core/compare/@metamask/client-utils@1.1.0...@metamask/client-utils@1.2.0
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/client-utils@1.0.0...@metamask/client-utils@1.1.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/client-utils@1.0.0
