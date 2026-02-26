# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- chore: secure PUBLISH_PREVIEW_NPM_TOKEN with GitHub environment ([#8011](https://github.com/MetaMask/core/pull/8011))

## [1.2.7]

### Changed

- Bump `@metamask/network-controller` from `^29.0.0` to `^30.0.0` ([#7996](https://github.com/MetaMask/core/pull/7996))
- Bump `@metamask/json-rpc-engine` from `^10.2.1` to `^10.2.2` ([#7856](https://github.com/MetaMask/core/pull/7856))
- Bump `@metamask/multichain-transactions-controller` from `7.0.0` to `7.0.1` ([#7897](https://github.com/MetaMask/core/pull/7897))
- Bump `@metamask/controller-utils` from `^11.18.0` to `^11.19.0` ([#7995](https://github.com/MetaMask/core/pull/7995))

## [1.2.6]

### Changed

- Bump `@metamask/json-rpc-engine` from `^10.2.0` to `^10.2.1` ([#7642](https://github.com/MetaMask/core/pull/7642))
- Upgrade `@metamask/utils` from `^11.8.1` to `^11.9.0` ([#7511](https://github.com/MetaMask/core/pull/7511))
- Bump `@metamask/network-controller` from `^27.0.0` to `^29.0.0` ([#7534](https://github.com/MetaMask/core/pull/7534), [#7583](https://github.com/MetaMask/core/pull/7583), [#7604](https://github.com/MetaMask/core/pull/7604), [#7642](https://github.com/MetaMask/core/pull/7642))
- Bump `@metamask/controller-utils` from `^11.16.0` to `^11.18.0` ([#7534](https://github.com/MetaMask/core/pull/7534), [#7583](https://github.com/MetaMask/core/pull/7583))
- Bump `@metamask/permission-controller` from `^12.1.1` to `^12.2.0` ([#7559](https://github.com/MetaMask/core/pull/7559))
- Bump `@metamask/chain-agnostic-permission` from `^1.3.0` to `^1.4.0` ([#7567](https://github.com/MetaMask/core/pull/7567))

### Fixed

- Fix `wallet_revokeSession` to handle cases where `params` is not provided ([#7551](https://github.com/MetaMask/core/pull/7551))

## [1.2.5]

### Changed

- Bump `@metamask/permission-controller` from `^12.1.0` to `^12.1.1` ([#7202](https://github.com/MetaMask/core/pull/7202))
- Bump `@metamask/network-controller` from `^26.0.0` to `^27.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202), [#7258](https://github.com/MetaMask/core/pull/7258))
- Bump `@metamask/json-rpc-engine` from `^10.1.1` to `^10.2.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- Bump `@metamask/controller-utils` from `^11.15.0` to `^11.16.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- Bump `@metamask/chain-agnostic-permission` from `^1.2.2` to `^1.3.0` ([#7322](https://github.com/MetaMask/core/pull/7322))

## [1.2.4]

### Changed

- Bump `@metamask/permission-controller` from `^12.0.0` to `^12.1.0` ([#6988](https://github.com/MetaMask/core/pull/6988))

### Fixed

- Fix `wallet_revokeSession` error handling ([#6987](https://github.com/MetaMask/core/pull/6987))
  - This was broken in a different way in v1.2.3. Fixed by the update to `@metamask/permission-controller@12.1.0`.

## [1.2.3]

### Changed

- Bump `@metamask/network-controller` from `^24.3.1` to `^25.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))
- Bump `@metamask/permission-controller` from `^11.1.1` to `^12.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))
- Bump `@metamask/chain-agnostic-permission` from `^1.2.1` to `^1.2.2` ([#6986](https://github.com/MetaMask/core/pull/6986))

### Fixed

- Fix `wallet_revokeSession` error handling in case where different versions of `@metamask/permission-controller` are used ([#6985](https://github.com/MetaMask/core/pull/6985))

## [1.2.2]

### Changed

- Bump `@metamask/chain-agnostic-permission` from `^1.2.0` to `^1.2.1` ([#6940](https://github.com/MetaMask/core/pull/6940))
- Bump `@metamask/network-controller` from `^24.2.1` to `^24.3.1` ([#6845](https://github.com/MetaMask/core/pull/6845), [#6883](https://github.com/MetaMask/core/pull/6883), [#6940](https://github.com/MetaMask/core/pull/6940))
- Bump `@metamask/permission-controller` from `^11.1.0` to `^11.1.1` ([#6940](https://github.com/MetaMask/core/pull/6940))

## [1.2.1]

### Changed

- Bump `@metamask/chain-agnostic-permission` from `^1.1.1` to `^1.2.0` ([#6807](https://github.com/MetaMask/core/pull/6807))
- Bump `@metamask/controller-utils` from `^11.14.0` to `^11.14.1` ([#6807](https://github.com/MetaMask/core/pull/6807))
- Bump `@metamask/json-rpc-engine` from `^10.1.0` to `^10.1.1` ([#6807](https://github.com/MetaMask/core/pull/6807))
- Bump `@metamask/network-controller` from `^24.2.0` to `^24.2.1` ([#6807](https://github.com/MetaMask/core/pull/6807))
- Bump `@metamask/permission-controller` from `^11.0.6` to `^11.1.0` ([#6807](https://github.com/MetaMask/core/pull/6807))

## [1.2.0]

### Changed

- Bump `@metamask/utils` from `^11.8.0` to `^11.8.1` ([#6708](https://github.com/MetaMask/core/pull/6708))
- `wallet_invokeMethod` no longer fails with unauthorized error if the `isMultichainOrigin` property is false on the requesting origin's CAIP-25 Permission ([#6703](https://github.com/MetaMask/core/pull/6703))

## [1.1.0]

### Changed

- Add partial permission revoke into `wallet_revokeSession` ([#6668](https://github.com/MetaMask/core/pull/6668))
- Bump `@metamask/chain-agnostic-permission` from `1.0.0` to `1.1.1` ([#6241](https://github.com/MetaMask/core/pull/6241), [#6345](https://github.com/MetaMask/core/pull/6241))
- Bump `@metamask/controller-utils` from `^11.10.0` to `^11.14.0` ([#6069](https://github.com/MetaMask/core/pull/6069), [#6303](https://github.com/MetaMask/core/pull/6303), [#6620](https://github.com/MetaMask/core/pull/6620), [#6629](https://github.com/MetaMask/core/pull/6629))
- Bump `@metamask/network-controller` from `^24.0.0` to `^24.2.0` ([#6148](https://github.com/MetaMask/core/pull/6148), [#6303](https://github.com/MetaMask/core/pull/6303), [#6678](https://github.com/MetaMask/core/pull/6678))
- Bump `@metamask/utils` from `^11.2.0` to `^11.4.2` ([#6054](https://github.com/MetaMask/core/pull/6054))
- Bump `@metamask/utils` from `^11.4.2` to `^11.8.0` ([#6588](https://github.com/MetaMask/core/pull/6588))
- Bump `@metamask/json-rpc-engine` from `^10.0.3` to `^10.1.0` ([#6678](https://github.com/MetaMask/core/pull/6678))

## [1.0.0]

### Changed

- This package is now considered stable ([#6013](https://github.com/MetaMask/core/pull/6013))
- Bump `@metamask/multichain-transactions-controller` to `^2.0.0` ([#5888](https://github.com/MetaMask/core/pull/5888))
- Bump `@metamask/controller-utils` to `^11.10.0` ([#5935](https://github.com/MetaMask/core/pull/5935))
- Bump `@metamask/network-controller` to `^23.6.0` ([#5935](https://github.com/MetaMask/core/pull/5935), [#5882](https://github.com/MetaMask/core/pull/5882))
- Bump `@metamask/chain-agnostic-permission` to `^1.0.0` ([#6013](https://github.com/MetaMask/core/pull/6013), [#5982](https://github.com/MetaMask/core/pull/5982), [#6004](https://github.com/MetaMask/core/pull/6004))
- Bump `@metamask/network-controller` to `^24.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))

## [0.4.0]

### Added

- When `wallet_createSession` handler is called with `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` (solana mainnet) as a requested scope, but there are not currently any accounts in the wallet supporting this scope, we now add a `promptToCreateSolanaAccount` to a metadata object on the `requestPermissions` call forwarded to the `PermissionsController`.

## [0.3.0]

### Added

- Add more chain-agnostic-permission utility functions from sip-26 usage ([#5609](https://github.com/MetaMask/core/pull/5609))

### Changed

- Bump `@metamask/chain-agnostic-permission` to `^0.7.0` ([#5715](https://github.com/MetaMask/core/pull/5715),[#5760](https://github.com/MetaMask/core/pull/5760), [#5818](https://github.com/MetaMask/core/pull/5818))
- Bump `@metamask/api-specs` to `^0.14.0` ([#5817](https://github.com/MetaMask/core/pull/5817))
- Bump `@metamask/controller-utils` to `^11.9.0` ([#5765](https://github.com/MetaMask/core/pull/5765), [#5812](https://github.com/MetaMask/core/pull/5812))
- Bump `@metamask/network-controller` to `^23.5.0` ([#5765](https://github.com/MetaMask/core/pull/5765), [#5812](https://github.com/MetaMask/core/pull/5812))

## [0.2.0]

### Added

- Add `wallet_createSession` handler ([#5647](https://github.com/MetaMask/core/pull/5647))
- Add `Caip25Errors` from `@metamask/chain-agnostic-permission` package ([#5566](https://github.com/MetaMask/core/pull/5566))

### Changed

- Bump `@metamask/chain-agnostic-permission` to `^0.4.0` ([#5674](https://github.com/MetaMask/core/pull/5674))
- Bump `@metamask/network-controller` to `^23.2.0` ([#5583](https://github.com/MetaMask/core/pull/5583))

## [0.1.1]

### Added

- Add `MultichainApiNotifications` enum to standardize notification method names ([#5491](https://github.com/MetaMask/core/pull/5491))

### Changed

- Bump `@metamask/network-controller` to `^23.1.0` ([#5507](https://github.com/MetaMask/core/pull/5507), [#5518](https://github.com/MetaMask/core/pull/5518))
- Bump `@metamask/chain-agnostic-permission` to `^0.2.0` ([#5518](https://github.com/MetaMask/core/pull/5518))

## [0.1.0]

### Added

- Initial release

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/multichain-api-middleware@1.2.7...HEAD
[1.2.7]: https://github.com/MetaMask/core/compare/@metamask/multichain-api-middleware@1.2.6...@metamask/multichain-api-middleware@1.2.7
[1.2.6]: https://github.com/MetaMask/core/compare/@metamask/multichain-api-middleware@1.2.5...@metamask/multichain-api-middleware@1.2.6
[1.2.5]: https://github.com/MetaMask/core/compare/@metamask/multichain-api-middleware@1.2.4...@metamask/multichain-api-middleware@1.2.5
[1.2.4]: https://github.com/MetaMask/core/compare/@metamask/multichain-api-middleware@1.2.3...@metamask/multichain-api-middleware@1.2.4
[1.2.3]: https://github.com/MetaMask/core/compare/@metamask/multichain-api-middleware@1.2.2...@metamask/multichain-api-middleware@1.2.3
[1.2.2]: https://github.com/MetaMask/core/compare/@metamask/multichain-api-middleware@1.2.1...@metamask/multichain-api-middleware@1.2.2
[1.2.1]: https://github.com/MetaMask/core/compare/@metamask/multichain-api-middleware@1.2.0...@metamask/multichain-api-middleware@1.2.1
[1.2.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-api-middleware@1.1.0...@metamask/multichain-api-middleware@1.2.0
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-api-middleware@1.0.0...@metamask/multichain-api-middleware@1.1.0
[1.0.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-api-middleware@0.4.0...@metamask/multichain-api-middleware@1.0.0
[0.4.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-api-middleware@0.3.0...@metamask/multichain-api-middleware@0.4.0
[0.3.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-api-middleware@0.2.0...@metamask/multichain-api-middleware@0.3.0
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-api-middleware@0.1.1...@metamask/multichain-api-middleware@0.2.0
[0.1.1]: https://github.com/MetaMask/core/compare/@metamask/multichain-api-middleware@0.1.0...@metamask/multichain-api-middleware@0.1.1
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/multichain-api-middleware@0.1.0
