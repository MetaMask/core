# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.0.0]

### Uncategorized

- chore: secure PUBLISH_PREVIEW_NPM_TOKEN with GitHub environment ([#8011](https://github.com/MetaMask/core/pull/8011))
- chore: upgrade `typedoc` from `^0.24.8` to `^0.25.13` ([#7898](https://github.com/MetaMask/core/pull/7898))
- chore: migrate Jest from v27 to v29 ([#7894](https://github.com/MetaMask/core/pull/7894))
- chore: upgrade Jest-related packages to latest 27.x versions ([#7792](https://github.com/MetaMask/core/pull/7792))
- Release/763.0.0 ([#7713](https://github.com/MetaMask/core/pull/7713))

### Added

- Pass `requiredAssets` from `wallet_sendCalls` to `addTransaction` and `addTransactionBatch` ([#7819](https://github.com/MetaMask/core/pull/7819))
- Bump `@metamask/transaction-controller` from `62.16.0` to `62.17.0` ([#7897](https://github.com/MetaMask/core/pull/7897))

### Changed

- Bump `@metamask/transaction-controller` from `^62.7.0` to `^62.19.0` ([#7596](https://github.com/MetaMask/core/pull/7596), [#7602](https://github.com/MetaMask/core/pull/7602), [#7604](https://github.com/MetaMask/core/pull/7604), [#7642](https://github.com/MetaMask/core/pull/7642), [#7737](https://github.com/MetaMask/core/pull/7737), [#7760](https://github.com/MetaMask/core/pull/7760), [#7775](https://github.com/MetaMask/core/pull/7775), [#7802](https://github.com/MetaMask/core/pull/7802), [#7832](https://github.com/MetaMask/core/pull/7832), [#7854](https://github.com/MetaMask/core/pull/7854), [#7872](https://github.com/MetaMask/core/pull/7872), [#7996](https://github.com/MetaMask/core/pull/7996), [#8005](https://github.com/MetaMask/core/pull/8005), [#8031](https://github.com/MetaMask/core/pull/8031))
- Bump `@metamask/utils` from `^11.8.1` to `^11.9.0` ([#7511](https://github.com/MetaMask/core/pull/7511))
- Make `wallet_sendCalls` more reliable ([#7816](https://github.com/MetaMask/core/pull/7816))

## [2.1.0]

### Added

- Id of JSON RPC request is passed to functions to create batched transaction, id is thus added to transaction meta ([#7415](https://github.com/MetaMask/core/pull/7415))

### Changed

- Bump `@metamask/transaction-controller` from `^61.3.0` to `^62.7.0` ([#7007](https://github.com/MetaMask/core/pull/7007), [#7126](https://github.com/MetaMask/core/pull/7126), [#7153](https://github.com/MetaMask/core/pull/7153), [#7202](https://github.com/MetaMask/core/pull/7202), [#7215](https://github.com/MetaMask/core/pull/7202), [#7220](https://github.com/MetaMask/core/pull/7220), [#7236](https://github.com/MetaMask/core/pull/7236), [#7257](https://github.com/MetaMask/core/pull/7257), [#7289](https://github.com/MetaMask/core/pull/7289), [#7325](https://github.com/MetaMask/core/pull/7325), [#7430](https://github.com/MetaMask/core/pull/7430), [#7494](https://github.com/MetaMask/core/pull/7494))

## [2.0.0]

### Changed

- **BREAKING:** Update `EIP5792Messenger` type to use new `Messenger` from `@metamask/messenger` ([#6958](https://github.com/MetaMask/core/pull/6958))
  - Previously the `Messenger` type from `@metamask/base-controller` was used, and `@metamask/base-controller` was mistakenly not listed as a dependency.
  - The package `@metamask/messenger` has been added as a dependency
- Bump `@metamask/transaction-controller` from `^60.10.0` to `^61.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))

## [1.2.4]

### Changed

- Bump `@metamask/transaction-controller` from `^60.7.0` to `^60.10.0` ([#6883](https://github.com/MetaMask/core/pull/6883), [#6888](https://github.com/MetaMask/core/pull/6888), [#6940](https://github.com/MetaMask/core/pull/6940))

## [1.2.3]

### Changed

- Bump `@metamask/transaction-controller` from `^60.6.1` to `^60.7.0` ([#6841](https://github.com/MetaMask/core/pull/6841))

## [1.2.2]

### Changed

- Bump `@metamask/transaction-controller` from `^60.6.0` to `^60.6.1` ([#6810](https://github.com/MetaMask/core/pull/6810))

## [1.2.1]

### Changed

- Bump `@metamask/utils` from `^11.8.0` to `^11.8.1` ([#6708](https://github.com/MetaMask/core/pull/6708))
- Bump `@metamask/transaction-controller` from `^60.4.0` to `^60.6.0` ([#6708](https://github.com/MetaMask/core/pull/6733), [#6771](https://github.com/MetaMask/core/pull/6771))
- Remove dependency `@metamask/eth-json-rpc-middleware` ([#6714](https://github.com/MetaMask/core/pull/6714))

## [1.2.0]

### Changed

- Add `auxiliaryFunds` + `requiredAssets` support defined under [ERC-7682](https://eips.ethereum.org/EIPS/eip-7682) ([#6623](https://github.com/MetaMask/core/pull/6623))
- Bump `@metamask/transaction-controller` from `^60.2.0` to `^60.4.0` ([#6561](https://github.com/MetaMask/core/pull/6561), [#6641](https://github.com/MetaMask/core/pull/6641))
- Bump `@metamask/utils` from `^11.4.2` to `^11.8.0` ([#6588](https://github.com/MetaMask/core/pull/6588))

## [1.1.0]

### Added

- Add and export EIP-5792 RPC method handler middlewares and utility types ([#6477](https://github.com/MetaMask/core/pull/6477))

## [1.0.0]

### Added

- Initial release ([#6458](https://github.com/MetaMask/core/pull/6458))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/eip-5792-middleware@3.0.0...HEAD
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/eip-5792-middleware@2.1.0...@metamask/eip-5792-middleware@3.0.0
[2.1.0]: https://github.com/MetaMask/core/compare/@metamask/eip-5792-middleware@2.0.0...@metamask/eip-5792-middleware@2.1.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/eip-5792-middleware@1.2.4...@metamask/eip-5792-middleware@2.0.0
[1.2.4]: https://github.com/MetaMask/core/compare/@metamask/eip-5792-middleware@1.2.3...@metamask/eip-5792-middleware@1.2.4
[1.2.3]: https://github.com/MetaMask/core/compare/@metamask/eip-5792-middleware@1.2.2...@metamask/eip-5792-middleware@1.2.3
[1.2.2]: https://github.com/MetaMask/core/compare/@metamask/eip-5792-middleware@1.2.1...@metamask/eip-5792-middleware@1.2.2
[1.2.1]: https://github.com/MetaMask/core/compare/@metamask/eip-5792-middleware@1.2.0...@metamask/eip-5792-middleware@1.2.1
[1.2.0]: https://github.com/MetaMask/core/compare/@metamask/eip-5792-middleware@1.1.0...@metamask/eip-5792-middleware@1.2.0
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/eip-5792-middleware@1.0.0...@metamask/eip-5792-middleware@1.1.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/eip-5792-middleware@1.0.0
