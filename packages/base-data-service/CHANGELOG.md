# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add support for cache persistence ([#9445](https://github.com/MetaMask/core/pull/9445))
  - Persistence can be configured by passing a `persistenceConfig` option to the constructor.
- Add `createServicePolicy` and related symbols, copied from `@metamask/controller-utils` ([#9418](https://github.com/MetaMask/core/pull/9418))
  - Added functions:
    `createServicePolicy`
  - Added constants:
    - `DEFAULT_CIRCUIT_BREAK_DURATION`
    - `DEFAULT_DEGRADED_THRESHOLD`
    - `DEFAULT_MAX_CONSECUTIVE_FAILURES`
    - `DEFAULT_MAX_RETRIES`
  - Added types:
    - `CreateServicePolicyOptions`
    - `ServicePolicy`
  - Added re-exports from `cockatiel`:
    - `BrokenCircuitError`
    - `CircuitState`
    - `CockatielEventEmitter`
    - `CockatielEvent`
    - `CockatielFailureReason`
    - `ConstantBackoff`
    - `ExponentialBackoff`
    - `handleAll`
    - `handleWhen`
- Export types `DataServiceActions` and `DataServiceEvents` ([#9475](https://github.com/MetaMask/core/pull/9475))

### Changed

- Bump `@metamask/utils` from `^11.9.0` to `^11.11.0` ([#9074](https://github.com/MetaMask/core/pull/9074))
- Bump `@metamask/controller-utils` from `^12.1.0` to `^12.3.0` ([#9058](https://github.com/MetaMask/core/pull/9058), [#9083](https://github.com/MetaMask/core/pull/9083), [#9218](https://github.com/MetaMask/core/pull/9218))
- Bump `@metamask/messenger` from `^1.2.0` to `^2.0.0` ([#9392](https://github.com/MetaMask/core/pull/9392))
- Add dependency `cockatiel` (`^3.1.2`) ([#9418](https://github.com/MetaMask/core/pull/9418))

## [0.1.3]

### Changed

- Bump `@metamask/controller-utils` from `^12.0.0` to `^12.1.0` ([#8774](https://github.com/MetaMask/core/pull/8774))

## [0.1.2]

### Changed

- Bump `@metamask/controller-utils` from `^11.19.0` to `^12.0.0` ([#8344](https://github.com/MetaMask/core/pull/8344), [#8755](https://github.com/MetaMask/core/pull/8755))
- Bump `@metamask/messenger` from `^1.0.0` to `^1.2.0` ([#8364](https://github.com/MetaMask/core/pull/8364), [#8373](https://github.com/MetaMask/core/pull/8373), [#8632](https://github.com/MetaMask/core/pull/8632))

## [0.1.1]

### Changed

- Bump `@metamask/messenger` from `^0.3.0` to `^1.0.0` ([#8317](https://github.com/MetaMask/core/pull/8317))

## [0.1.0]

### Added

- Initial release ([#8039](https://github.com/MetaMask/core/pull/8039), [#8292](https://github.com/MetaMask/core/pull/8292))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/base-data-service@0.1.3...HEAD
[0.1.3]: https://github.com/MetaMask/core/compare/@metamask/base-data-service@0.1.2...@metamask/base-data-service@0.1.3
[0.1.2]: https://github.com/MetaMask/core/compare/@metamask/base-data-service@0.1.1...@metamask/base-data-service@0.1.2
[0.1.1]: https://github.com/MetaMask/core/compare/@metamask/base-data-service@0.1.0...@metamask/base-data-service@0.1.1
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/base-data-service@0.1.0
