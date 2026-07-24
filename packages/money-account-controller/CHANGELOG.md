# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- chore: migrate Jest from v29 to v30 ([#7905](https://github.com/MetaMask/core/pull/7905))
- refactor: add `.js` import extensions to Accounts packages ([#9581](https://github.com/MetaMask/core/pull/9581))
- Ensure refs in tsconfig files are synced with internal deps ([#8384](https://github.com/MetaMask/core/pull/8384))
- chore: MIT license text update ([#9472](https://github.com/MetaMask/core/pull/9472))
- Revert "Release/1115.0.0 ([#9464](https://github.com/MetaMask/core/pull/9464))
- Release/1115.0.0 ([#9464](https://github.com/MetaMask/core/pull/9464))
- Revert "Release/1064.0.0 (#9228)" ([#9228](https://github.com/MetaMask/core/pull/9228))
- Release/1064.0.0 ([#9228](https://github.com/MetaMask/core/pull/9228))

### Changed

- Bump `@metamask/utils` from `^11.9.0` to `^11.11.0` ([#9074](https://github.com/MetaMask/core/pull/9074))
- Bump `@metamask/keyring-controller` from `^27.0.0` to `^27.1.0` ([#9129](https://github.com/MetaMask/core/pull/9129))
- Bump `@metamask/accounts-controller` from `^39.0.1` to `^39.0.5` ([#9218](https://github.com/MetaMask/core/pull/9218), [#9231](https://github.com/MetaMask/core/pull/9231), [#9349](https://github.com/MetaMask/core/pull/9349), [#9470](https://github.com/MetaMask/core/pull/9470))
- Bump `@metamask/keyring-api` from `^23.1.0` to `^23.5.0` ([#9249](https://github.com/MetaMask/core/pull/9249), [#9390](https://github.com/MetaMask/core/pull/9390))
- Bump `@metamask/messenger` from `^1.2.0` to `^2.0.0` ([#9392](https://github.com/MetaMask/core/pull/9392))

## [0.3.3]

### Changed

- Bump `@metamask/accounts-controller` from `^39.0.0` to `^39.0.1` ([#9058](https://github.com/MetaMask/core/pull/9058))
- Bump `@metamask/keyring-controller` from `^26.0.0` to `^27.0.0` ([#9058](https://github.com/MetaMask/core/pull/9058))

## [0.3.2]

### Changed

- Bump `@metamask/accounts-controller` from `^38.1.2` to `^39.0.0` ([#8999](https://github.com/MetaMask/core/pull/8999))

## [0.3.1]

### Changed

- Bump `@metamask/accounts-controller` from `^38.0.0` to `^38.1.2` ([#8755](https://github.com/MetaMask/core/pull/8755), [#8774](https://github.com/MetaMask/core/pull/8774), [#8912](https://github.com/MetaMask/core/pull/8912))
- Bump `@metamask/keyring-controller` from `^25.5.0` to `^26.0.0` ([#8912](https://github.com/MetaMask/core/pull/8912))

## [0.3.0]

### Added

- Expose missing `MoneyAccountController:init` action through its messenger ([#8718](https://github.com/MetaMask/core/pull/8718))
  - Corresponding action type is available as well.

### Changed

- Bump `@metamask/keyring-controller` from `^25.4.0` to `^25.5.0` ([#8722](https://github.com/MetaMask/core/pull/8722))

## [0.2.0]

### Changed

- Bump `@metamask/accounts-controller` from `^37.2.0` to `^38.0.0` ([#8665](https://github.com/MetaMask/core/pull/8665))
- Bump `@metamask/messenger` from `^1.1.0` to `^1.2.0` ([#8373](https://github.com/MetaMask/core/pull/8373), [#8632](https://github.com/MetaMask/core/pull/8632))
- Bump `@metamask/base-controller` from `^9.0.1` to `^9.1.0` ([#8457](https://github.com/MetaMask/core/pull/8457))
- Bump `@metamask/eth-money-keyring` from `^2.0.0` to `^2.0.4` ([#8464](https://github.com/MetaMask/core/pull/8464), [#8584](https://github.com/MetaMask/core/pull/8584), [#8647](https://github.com/MetaMask/core/pull/8647))
- Bump `@metamask/keyring-api` from `^21.6.0` to `^23.1.0` ([#8464](https://github.com/MetaMask/core/pull/8464), [#8647](https://github.com/MetaMask/core/pull/8647))
- Bump `@metamask/keyring-controller` from `^25.2.0` to `^25.4.0` ([#8634](https://github.com/MetaMask/core/pull/8634), [#8665](https://github.com/MetaMask/core/pull/8665))

## [0.1.0]

### Added

- Add `MoneyAccountController` ([#8361](https://github.com/MetaMask/core/pull/8361))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/money-account-controller@0.3.3...HEAD
[0.3.3]: https://github.com/MetaMask/core/compare/@metamask/money-account-controller@0.3.2...@metamask/money-account-controller@0.3.3
[0.3.2]: https://github.com/MetaMask/core/compare/@metamask/money-account-controller@0.3.1...@metamask/money-account-controller@0.3.2
[0.3.1]: https://github.com/MetaMask/core/compare/@metamask/money-account-controller@0.3.0...@metamask/money-account-controller@0.3.1
[0.3.0]: https://github.com/MetaMask/core/compare/@metamask/money-account-controller@0.2.0...@metamask/money-account-controller@0.3.0
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/money-account-controller@0.1.0...@metamask/money-account-controller@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/money-account-controller@0.1.0
