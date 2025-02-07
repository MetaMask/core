# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0]

### Changed

- **BREAKING:** Remove `NETWORK_ASSETS_MAP` variable and its exports (network-to-native-asset mapping), making it no longer available for consumers ([#5295](https://github.com/MetaMask/core/pull/5295))
- Bump `@metamask/base-controller` from `^7.1.1` to `^8.0.0` ([#5305](https://github.com/MetaMask/core/pull/5305))
- Bump `@metamask/polling-controller` from `^12.0.2` to `^12.0.3` ([#5305](https://github.com/MetaMask/core/pull/5305))

## [0.2.0]

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency from `^22.0.0` to `^23.0.0` ([#5292](https://github.com/MetaMask/core/pull/5292))
- **BREAKING:** Bump `@metamask/snaps-controllers` peer dependency from `^9.10.0` to `^9.19.0` ([#5265](https://github.com/MetaMask/core/pull/5265))
- Bump `@metamask/snaps-sdk` from `^6.7.0` to `^6.17.1` ([#5220](https://github.com/MetaMask/core/pull/5220)), ([#5265](https://github.com/MetaMask/core/pull/5265))
- Bump `@metamask/snaps-utils` from `^8.9.0` to `^8.10.0` ([#5265](https://github.com/MetaMask/core/pull/5265))
- Bump `@metamask/snaps-controllers` from `^9.10.0` to `^9.19.0` ([#5265](https://github.com/MetaMask/core/pull/5265))
- Bump `@metamask/keyring-api"` from `^16.1.0` to `^17.0.0` ([#5280](https://github.com/MetaMask/core/pull/5280))
- Bump `@metamask/utils` from `^11.0.1` to `^11.1.0` ([#5223](https://github.com/MetaMask/core/pull/5223))
- Removed polling mechanism and now relies on the new `AccountsController:accountTransactionsUpdated` event ([#5221](https://github.com/MetaMask/core/pull/5221))

## [0.1.0]

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency from `^21.0.0` to `^22.0.0` ([#5218](https://github.com/MetaMask/core/pull/5218))
- Bump `@metamask/keyring-api` from `^14.0.0` to `^16.1.0` ([#5190](https://github.com/MetaMask/core/pull/5190)), ([#5208](https://github.com/MetaMask/core/pull/5208))
- Bump `@metamask/keyring-internal-api` from `^2.0.1` to `^4.0.1` ([#5190](https://github.com/MetaMask/core/pull/5190)), ([#5208](https://github.com/MetaMask/core/pull/5208))
- Bump `@metamask/keyring-snap-client` from `^3.0.0` to `^3.0.3` ([#5190](https://github.com/MetaMask/core/pull/5190)), ([#5208](https://github.com/MetaMask/core/pull/5208))

## [0.0.1]

### Added

- Initial release ([#5133](https://github.com/MetaMask/core/pull/5133)), ([#5177](https://github.com/MetaMask/core/pull/5177))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/multichain-transactions-controller@1.0.0...HEAD
[1.0.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-transactions-controller@0.2.0...@metamask/multichain-transactions-controller@1.0.0
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-transactions-controller@0.1.0...@metamask/multichain-transactions-controller@0.2.0
[0.1.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-transactions-controller@0.0.1...@metamask/multichain-transactions-controller@0.1.0
[0.0.1]: https://github.com/MetaMask/core/releases/tag/@metamask/multichain-transactions-controller@0.0.1
