# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `AnalyticsDataRegulationServiceInvalidateQueriesAction`, `AnalyticsDataRegulationServiceCacheUpdatedEvent` and `AnalyticsDataRegulationServiceGranularCacheUpdatedEvent`, also included in `AnalyticsDataRegulationServiceActions` and `AnalyticsDataRegulationServiceEvents` ([#10879](https://github.com/MetaMask/core/pull/10879))

### Changed

- **BREAKING:** `AnalyticsDataRegulationService` now extends `BaseDataService` from `@metamask/base-data-service` ([#10879](https://github.com/MetaMask/core/pull/10879))
  - `AnalyticsDataRegulationServiceMessenger` now includes the `:invalidateQueries` action and `:cacheUpdated` events. Messengers built from `AnalyticsDataRegulationServiceActions` / `AnalyticsDataRegulationServiceEvents` pick these up automatically.
- **BREAKING:** Drop CommonJS support ([#9536](https://github.com/MetaMask/core/pull/9536))
  - This package is now ESM-only, but can still be used in CommonJS projects via `require(esm)` in modern Node.js versions (22+), or dynamic imports in older Node.js versions.
- **BREAKING:** Bump minimum Node.js version to 22 ([#9976](https://github.com/MetaMask/core/pull/9976))
- **BREAKING:** Bump TypeScript target to ES2022 ([#10019](https://github.com/MetaMask/core/pull/10019))
  - This package now ships ES2022 code, requiring a compatible modern environment or bundler configuration to consume.
- `createDataDeletionTask` no longer retries on 5xx responses ([#10879](https://github.com/MetaMask/core/pull/10879))
- Concurrent `checkDataDeleteStatus` calls for the same regulation ID now share one request ([#10879](https://github.com/MetaMask/core/pull/10879))
- A malformed `createDataDeletionTask` response now throws `Mutation function for "AnalyticsDataRegulationService:createDataDeletionTask" returned an unexpected response: …` ([#10879](https://github.com/MetaMask/core/pull/10879))
- Add dependencies `@metamask/base-data-service` ^2.1.0 and `@metamask/superstruct` ^3.4.1 ([#10879](https://github.com/MetaMask/core/pull/10879))
- Bump `@metamask/utils` from `^11.9.0` to `^12.0.0` ([#9074](https://github.com/MetaMask/core/pull/9074), [#10076](https://github.com/MetaMask/core/pull/10076), [#10192](https://github.com/MetaMask/core/pull/10192))
- Bump `@metamask/controller-utils` from `^11.19.0` to `^13.0.0` ([#8344](https://github.com/MetaMask/core/pull/8344), [#8755](https://github.com/MetaMask/core/pull/8755), [#8774](https://github.com/MetaMask/core/pull/8774), [#9058](https://github.com/MetaMask/core/pull/9058), [#9083](https://github.com/MetaMask/core/pull/9083), [#9218](https://github.com/MetaMask/core/pull/9218), [#10160](https://github.com/MetaMask/core/pull/10160))
- Bump `@metamask/messenger` from `^1.1.0` to `^3.0.0` ([#8373](https://github.com/MetaMask/core/pull/8373), [#8632](https://github.com/MetaMask/core/pull/8632), [#9392](https://github.com/MetaMask/core/pull/9392), [#10160](https://github.com/MetaMask/core/pull/10160))
- Bump `@metamask/base-controller` from `^9.0.1` to `^10.1.0` ([#8457](https://github.com/MetaMask/core/pull/8457), [#10160](https://github.com/MetaMask/core/pull/10160), [#10864](https://github.com/MetaMask/core/pull/10864))

### Removed

- **BREAKING:** Remove `onRetry`, `onBreak` and `onDegraded` from `AnalyticsDataRegulationService` ([#10879](https://github.com/MetaMask/core/pull/10879))

[Unreleased]: https://github.com/MetaMask/core/
