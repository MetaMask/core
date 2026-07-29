# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- refactor: add `.js` import extensions to Mobile and Extension Platform packages ([#9628](https://github.com/MetaMask/core/pull/9628))
- chore: migrate Jest from v29 to v30 ([#7905](https://github.com/MetaMask/core/pull/7905))
- Ensure refs in tsconfig files are synced with internal deps ([#8384](https://github.com/MetaMask/core/pull/8384))

### Changed

- Bump `@metamask/messenger` from `^1.2.0` to `^2.0.0` ([#9392](https://github.com/MetaMask/core/pull/9392))

## [1.2.1]

### Changed

- Preserve the pre-consent event queue when calling `resetConsentDecision`, matching extension behavior for undecided consent resets during onboarding restarts ([#9284](https://github.com/MetaMask/core/pull/9284))

## [1.2.0]

### Added

- Add optional pre-consent event queue to `AnalyticsController` (disabled by default via `isPreConsentQueueEnabled`), with a `consentDecisionMade` state field, `selectConsentDecisionMade` selector, and `resetConsentDecision` action ([#9252](https://github.com/MetaMask/core/pull/9252))

### Changed

- Bump `@metamask/utils` from `^11.9.0` to `^11.11.0` ([#9074](https://github.com/MetaMask/core/pull/9074))

## [1.1.1]

### Fixed

- Clear persisted analytics event queue entries after the delivery callback runs, including when the callback reports an error. ([#8934](https://github.com/MetaMask/core/pull/8934))

## [1.1.0]

### Added

- Optional persisted event queue support in `AnalyticsController`, disabled by default. ([#8797](https://github.com/MetaMask/core/pull/8797))
- Add optional analytics context on `trackEvent`, `identify`, and `trackView` to forward platform-specific context to `AnalyticsPlatformAdapter` implementations ([#8835](https://github.com/MetaMask/core/pull/8835))
- Optional `skipUUIDv4Check` on `AnalyticsPlatformAdapter` to allow non-UUIDv4 `analyticsId` strings when constructing `AnalyticsController` ([#8543](https://github.com/MetaMask/core/pull/8543))

### Changed

- Mark `analyticsId` as persisted (`persist: true`) in `AnalyticsController` state metadata so it is saved and restored with `optedIn` when using a persisted controller composition ([#8542](https://github.com/MetaMask/core/pull/8542))
- Bump `@metamask/messenger` from `^1.0.0` to `^1.2.0` ([#8364](https://github.com/MetaMask/core/pull/8364), [#8373](https://github.com/MetaMask/core/pull/8373), [#8632](https://github.com/MetaMask/core/pull/8632))
- Bump `@metamask/base-controller` from `^9.0.1` to `^9.1.0` ([#8457](https://github.com/MetaMask/core/pull/8457))

## [1.0.1]

### Changed

- Bump `@metamask/base-controller` from `^9.0.0` to `^9.0.1` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/messenger` from `^0.3.0` to `^1.0.0` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Upgrade `@metamask/utils` from `^11.8.1` to `^11.9.0` ([#7511](https://github.com/MetaMask/core/pull/7511))

## [1.0.0]

### Added

- Initial release of @metamask/analytics-controller. ([#7017](https://github.com/MetaMask/core/pull/7017), [#7202](https://github.com/MetaMask/core/pull/7202))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/analytics-controller@1.2.1...HEAD
[1.2.1]: https://github.com/MetaMask/core/compare/@metamask/analytics-controller@1.2.0...@metamask/analytics-controller@1.2.1
[1.2.0]: https://github.com/MetaMask/core/compare/@metamask/analytics-controller@1.1.1...@metamask/analytics-controller@1.2.0
[1.1.1]: https://github.com/MetaMask/core/compare/@metamask/analytics-controller@1.1.0...@metamask/analytics-controller@1.1.1
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/analytics-controller@1.0.1...@metamask/analytics-controller@1.1.0
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/analytics-controller@1.0.0...@metamask/analytics-controller@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/analytics-controller@1.0.0
