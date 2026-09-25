# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add the persisted `providerFlowStatus` state field and `KycController:getProviderFlowStatus` messenger action to distinguish provider flows that were submitted, abandoned, or failed ([#10457](https://github.com/MetaMask/core/pull/10457))

### Changed

- **BREAKING:** `KycController.launchProviderFlow` and its messenger action now return the durable provider-flow outcome instead of `void` ([#10457](https://github.com/MetaMask/core/pull/10457))

## [0.5.0]

### Changed

- `KycService` GET endpoints now call `fetch` directly instead of `fetchQuery`, so read responses are no longer cached in the service `QueryClient` ([#10375](https://github.com/MetaMask/core/pull/10375))
- Bump `@metamask/profile-sync-controller` from `^32.1.1` to `^33.0.0` ([#10348](https://github.com/MetaMask/core/pull/10348), [#10409](https://github.com/MetaMask/core/pull/10409), [#10418](https://github.com/MetaMask/core/pull/10418), [#10459](https://github.com/MetaMask/core/pull/10459))
- Bump `@tanstack/query-core` from `^5.62.16` to `^5.89.0` ([#9324](https://github.com/MetaMask/core/pull/9324))

## [0.4.0]

### Added

- Export `MoonPayFrameHandler`, `MoonPayFrameHandlerOptions`, and `clearMoonPaySession` so clients can own MoonPay Check/Auth frames after those methods left `KycController` ([#10293](https://github.com/MetaMask/core/pull/10293))
- Add `sessionStatus` (`KycSessionStatus | null`) to `KycControllerState` ([#10293](https://github.com/MetaMask/core/pull/10293))
- Add `KycService.getSessionStatusForVendor`, which fetches `GET /sessions/latest/status/{vendor}` and returns `KycSessionStatus` or `null` ([#10293](https://github.com/MetaMask/core/pull/10293))
- Add `KycController.fetchVendorDisclaimers`, which loads vendor T&Cs via `KycService.fetchVendorDisclaimers` ([#10293](https://github.com/MetaMask/core/pull/10293))
- Add `KycController.hasCompletedVendorDisclaimers`, which fetches the vendor T&C catalog and returns whether persisted `vendorDisclaimersAccepted` covers every fetched disclaimer ([#10293](https://github.com/MetaMask/core/pull/10293))
- Add `KycController.recordVendorDisclaimers`, which records vendor T&Cs via `KycService.submitVendorDisclaimers` and persists accepted ids on state ([#10293](https://github.com/MetaMask/core/pull/10293))
- Add `KycController.startSession`, which reuses the latest vendor session when one exists and otherwise creates the vendor customer and a UKYC session ([#10293](https://github.com/MetaMask/core/pull/10293))
- Add `KycController.launchProviderFlow`, which presents the identity-provider (SumSub) verification UI ([#10293](https://github.com/MetaMask/core/pull/10293))
- Add `KycController.startSessionStatusPolling`, which polls `GET /sessions/{id}/status` for `state.sessionStatus.id` until `finalStatus` is `approved`, `rejected`, or `retry` ([#10293](https://github.com/MetaMask/core/pull/10293))
- Expose current `KycController` methods as messenger actions: `startSession`, `reset`, `clearState`, `getSessionStatusForVendor`, `refreshSessionStatus`, `startSessionStatusPolling`, `fetchSessionDisclaimers`, `recordSessionDisclaimers`, `hasCompletedSessionDisclaimers`, `fetchVendorDisclaimers`, `recordVendorDisclaimers`, `hasCompletedVendorDisclaimers`, and `launchProviderFlow` ([#10293](https://github.com/MetaMask/core/pull/10293))

### Changed

- **BREAKING:** Add required `id` to `KycSessionStatus` ([#10293](https://github.com/MetaMask/core/pull/10293))
- **BREAKING:** Rename `CreateSessionParams` to `CreateMoonpaySessionParams`, and `KycService.createSession` / `KycService:createSession` to `createMoonpaySession` / `KycService:createMoonpaySession` ([#10293](https://github.com/MetaMask/core/pull/10293))
- `MoonPayFrameHandler.buildCheckFrameUrl` no longer sets the `skipKyc` query parameter ([#10293](https://github.com/MetaMask/core/pull/10293))
- Bump `@metamask/profile-sync-controller` from `^32.1.0` to `^32.1.1` ([#10220](https://github.com/MetaMask/core/pull/10220))

### Removed

- **BREAKING:** Remove unused `KycCustomerIdentity` ([#10293](https://github.com/MetaMask/core/pull/10293))
- **BREAKING:** Remove `sessionStatusPollIntervalMs` and `userStatusPollIntervalMs` from `KycControllerOptions`, and stop automatic session-status and user-status polling. Session-status polling is now opt-in through `startSessionStatusPolling` or `refreshSessionStatus` ([#10293](https://github.com/MetaMask/core/pull/10293))
- **BREAKING:** Remove the `reselect` dependency ([#10293](https://github.com/MetaMask/core/pull/10293))
- **BREAKING:** Remove the `polling` value from `KycSumSubStatus` ([#10293](https://github.com/MetaMask/core/pull/10293))
- **BREAKING:** Remove MoonPay Check/Auth frame methods from `KycController`: `handleFrameMessage`, `buildCheckFrameUrl`, `buildAuthFrameUrl`, and `buildResetFrameUrl`. Use `MoonPayFrameHandler` directly for frame protocol, URLs, and message handling ([#10293](https://github.com/MetaMask/core/pull/10293))
- **BREAKING:** Remove `KycService.checkKycRequired`, `CheckKycRequiredParams`, and the `KycService:checkKycRequired` messenger action ([#10293](https://github.com/MetaMask/core/pull/10293))
- **BREAKING:** Remove `KycService.fetchKycStatus`, `KycService:fetchKycStatus`, `KycController.refreshKycStatus`, `KycController:refreshKycStatus`, `KycUserStatus`, `KycUserStatusResponse`, and `KycController:statusChanged` (`KycControllerStatusChangedEvent`) ([#10293](https://github.com/MetaMask/core/pull/10293))
- **BREAKING:** Replace the previous `KycController` messenger method actions. Removed: `initialize`, `createVendorCustomer`, `loadDisclaimers`, `acceptTermsAndStartSession`, `clearSavedTerms`, `checkKycRequired`, `getKycStatus`, `getCustomerIdentity`, `startSumSub`, and `getSessionStatus` ([#10293](https://github.com/MetaMask/core/pull/10293))
- **BREAKING:** Replace `selectKycPhase`, `selectKycSumSub`, and `selectIsKycRequiredForProduct` with `selectKycVendor` and `selectKycSessionStatus` ([#10293](https://github.com/MetaMask/core/pull/10293))

## [0.3.0]

### Added

- Add `KycController.fetchSessionDisclaimers`, which fetches the idOS + KYC-provider disclaimers by `{ sessionId }` or `{ country }`. ([#10162](https://github.com/MetaMask/core/pull/10162))

### Changed

- **BREAKING:** Rename `KycService.fetchDisclaimersCatalog` to `fetchSessionDisclaimersByCountry`. ([#10162](https://github.com/MetaMask/core/pull/10162))
  - Rename `FetchDisclaimersCatalogParams` to `FetchSessionDisclaimersByCountryParams`.
  - Rename the messenger action `KycService:fetchDisclaimersCatalog` to `KycService:fetchSessionDisclaimersByCountry`.
- **BREAKING:** Rename `KycService.fetchSessionDisclaimers` to `fetchSessionDisclaimersBySessionId` ([#10162](https://github.com/MetaMask/core/pull/10162))
  - Rename `FetchSessionDisclaimersParams` to `FetchSessionDisclaimersBySessionIdParams`.
  - Rename the messenger action `KycService:fetchSessionDisclaimers` to `KycService:fetchSessionDisclaimersBySessionId`.
- Bump `@metamask/profile-sync-controller` from `^31.0.0` to `^32.1.0` ([#10166](https://github.com/MetaMask/core/pull/10166), [#10184](https://github.com/MetaMask/core/pull/10184))
- Bump `@metamask/utils` from `^11.12.0` to `^12.0.0` ([#10192](https://github.com/MetaMask/core/pull/10192))

## [0.2.0]

### Changed

- **BREAKING:** Drop CommonJS support ([#9536](https://github.com/MetaMask/core/pull/9536))
  - This package is now ESM-only, but can still be used in CommonJS projects via `require(esm)` in modern Node.js versions (22+), or dynamic imports in older Node.js versions.
- **BREAKING:** Bump minimum Node.js version to 22 ([#9976](https://github.com/MetaMask/core/pull/9976))
- **BREAKING:** Bump TypeScript target to ES2022 ([#10019](https://github.com/MetaMask/core/pull/10019))
  - This package now ships ES2022 code, requiring a compatible modern environment or bundler configuration to consume.
- Bump `@metamask/base-controller` from `^9.1.0` to `^10.0.0` ([#10160](https://github.com/MetaMask/core/pull/10160))
- Bump `@metamask/base-data-service` from `^1.0.0` to `^2.0.0` ([#10160](https://github.com/MetaMask/core/pull/10160))
- Bump `@metamask/controller-utils` from `^12.3.0` to `^13.0.0` ([#10160](https://github.com/MetaMask/core/pull/10160))
- Bump `@metamask/geolocation-controller` from `^1.0.0` to `^2.0.0` ([#10160](https://github.com/MetaMask/core/pull/10160))
- Bump `@metamask/messenger` from `^2.0.0` to `^3.0.0` ([#10160](https://github.com/MetaMask/core/pull/10160))
- Bump `@metamask/profile-sync-controller` from `^30.0.0` to `^31.0.0` ([#10160](https://github.com/MetaMask/core/pull/10160))

## [0.1.0]

### Added

- Initial Release ([#10145](https://github.com/MetaMask/core/pull/10145))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/kyc-controller@0.5.0...HEAD
[0.5.0]: https://github.com/MetaMask/core/compare/@metamask/kyc-controller@0.4.0...@metamask/kyc-controller@0.5.0
[0.4.0]: https://github.com/MetaMask/core/compare/@metamask/kyc-controller@0.3.0...@metamask/kyc-controller@0.4.0
[0.3.0]: https://github.com/MetaMask/core/compare/@metamask/kyc-controller@0.2.0...@metamask/kyc-controller@0.3.0
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/kyc-controller@0.1.0...@metamask/kyc-controller@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/kyc-controller@0.1.0
