# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Point `GeolocationApiService` at API Platform's `geolocation-api` service instead of the legacy Ramps-owned `on-ramp` geolocation endpoint, which is slated for deprecation ([#9417](https://github.com/MetaMask/core/pull/9417))
  - UAT temporarily resolves to the production URL since API Platform has not yet provisioned a dedicated UAT deployment for this service
- Bump `@metamask/controller-utils` from `^12.0.0` to `^12.3.0` ([#8774](https://github.com/MetaMask/core/pull/8774), [#9058](https://github.com/MetaMask/core/pull/9058), [#9083](https://github.com/MetaMask/core/pull/9083), [#9218](https://github.com/MetaMask/core/pull/9218))
- Bump `@metamask/messenger` from `^1.2.0` to `^2.0.0` ([#9392](https://github.com/MetaMask/core/pull/9392))

## [0.1.3]

### Changed

- Bump `@metamask/controller-utils` from `^11.19.0` to `^12.0.0` ([#8344](https://github.com/MetaMask/core/pull/8344), [#8755](https://github.com/MetaMask/core/pull/8755))
- Bump `@metamask/messenger` from `^1.0.0` to `^1.2.0` ([#8364](https://github.com/MetaMask/core/pull/8364), [#8373](https://github.com/MetaMask/core/pull/8373), [#8632](https://github.com/MetaMask/core/pull/8632))
- Bump `@metamask/base-controller` from `^9.0.1` to `^9.1.0` ([#8457](https://github.com/MetaMask/core/pull/8457))

## [0.1.2]

### Changed

- Bump `@metamask/base-controller` from `^9.0.0` to `^9.0.1` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/messenger` from `^0.3.0` to `^1.0.0` ([#8317](https://github.com/MetaMask/core/pull/8317))

## [0.1.1]

### Fixed

- Accept ISO 3166-2 subdivision codes (e.g. `US-NY`, `CA-ON`) from the geolocation API, not just 2-letter country codes ([#8137](https://github.com/MetaMask/core/pull/8137))

## [0.1.0]

### Added

- Initial release ([#8037](https://github.com/MetaMask/core/pull/8037))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/geolocation-controller@0.1.3...HEAD
[0.1.3]: https://github.com/MetaMask/core/compare/@metamask/geolocation-controller@0.1.2...@metamask/geolocation-controller@0.1.3
[0.1.2]: https://github.com/MetaMask/core/compare/@metamask/geolocation-controller@0.1.1...@metamask/geolocation-controller@0.1.2
[0.1.1]: https://github.com/MetaMask/core/compare/@metamask/geolocation-controller@0.1.0...@metamask/geolocation-controller@0.1.1
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/geolocation-controller@0.1.0
