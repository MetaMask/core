# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **BREAKING:** `KycController.checkKycRequired` and the consents-path session (`acceptTermsAndStartSession` / a resumed `initialize`) now rethrow the underlying error after recording it on controller state.
  - A product-scoped MoonPay auto-run therefore rejects `handleFrameMessage` / `onAuthenticated` when the KYC-required check fails, instead of only setting `phase: 'error'`.

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/kyc-controller@0.3.0...HEAD
[0.3.0]: https://github.com/MetaMask/core/compare/@metamask/kyc-controller@0.2.0...@metamask/kyc-controller@0.3.0
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/kyc-controller@0.1.0...@metamask/kyc-controller@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/kyc-controller@0.1.0
