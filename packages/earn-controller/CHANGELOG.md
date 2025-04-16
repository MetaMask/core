# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.11.0]

### Added

- Refresh staking data when staking txs are confirmed ([#5607](https://github.com/MetaMask/core/pull/5607))

### Changed

- Bump `@metamask/controller-utils` to `^11.7.0` ([#5583](https://github.com/MetaMask/core/pull/5583))

## [0.10.0]

### Changed

- **BREAKING:** Updated `EarnController` methods (`refreshPooledStakingData`, `refreshPooledStakes`, and `refreshStakingEligibility`) to use an options bag parameter ([#5537](https://github.com/MetaMask/core/pull/5537))

## [0.9.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` to `^27.0.0` ([#5507](https://github.com/MetaMask/core/pull/5507))
- **BREAKING:** Bump peer dependency `@metamask/network-controller` to `^23.0.0` ([#5507](https://github.com/MetaMask/core/pull/5507))

## [0.8.0]

### Changed

- Updated refreshPooledStakingVaultDailyApys days arg default value to 365 ([#5453](https://github.com/MetaMask/core/pull/5453))

## [0.7.0]

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency to `^26.0.0` ([#5439](https://github.com/MetaMask/core/pull/5439))

## [0.6.0]

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency to `^25.0.0` ([#5426](https://github.com/MetaMask/core/pull/5426))

## [0.5.0]

### Added

- Add pooled staking vault daily apys and vault apy averages to earn controller ([#5368](https://github.com/MetaMask/core/pull/5368))

## [0.4.0]

### Added

- Add resetCache arg to `refreshPooledStakingData` and `refreshPooledStakes` in EarnController ([#5334](https://github.com/MetaMask/core/pull/5334))

## [0.3.0]

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency from `^23.0.0` to `^24.0.0` ([#5318](https://github.com/MetaMask/core/pull/5318))

## [0.2.1]

### Changed

- Bump `@metamask/base-controller` from `^7.1.1` to `^8.0.0` ([#5305](https://github.com/MetaMask/core/pull/5305))

## [0.2.0]

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency from `^22.0.0` to `^23.0.0` ([#5292](https://github.com/MetaMask/core/pull/5292))
- Bump `@metamask/controller-utils` dependency from `^11.4.5` to `^11.5.0`([#5272](https://github.com/MetaMask/core/pull/5272))

## [0.1.0]

### Added

- Initial release ([#5271](https://github.com/MetaMask/core/pull/5271))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@0.11.0...HEAD
[0.11.0]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@0.10.0...@metamask/earn-controller@0.11.0
[0.10.0]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@0.9.0...@metamask/earn-controller@0.10.0
[0.9.0]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@0.8.0...@metamask/earn-controller@0.9.0
[0.8.0]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@0.7.0...@metamask/earn-controller@0.8.0
[0.7.0]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@0.6.0...@metamask/earn-controller@0.7.0
[0.6.0]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@0.5.0...@metamask/earn-controller@0.6.0
[0.5.0]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@0.4.0...@metamask/earn-controller@0.5.0
[0.4.0]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@0.3.0...@metamask/earn-controller@0.4.0
[0.3.0]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@0.2.1...@metamask/earn-controller@0.3.0
[0.2.1]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@0.2.0...@metamask/earn-controller@0.2.1
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@0.1.0...@metamask/earn-controller@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/earn-controller@0.1.0
