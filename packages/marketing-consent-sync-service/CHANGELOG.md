# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release ([#11170](https://github.com/MetaMask/core/pull/11170))
  - Add `MarketingConsentSyncService`, which keeps marketing consent in sync with Authenticated User Storage and turns off marketing notification channels before an opt-out is saved
  - Add `initialize` method, which reads the controllers it depends on and starts syncing; call it once they are registered
  - Add `setMarketingConsent` method and `MarketingConsentSyncService:setMarketingConsent` action, which apply a consent change and wait until Authenticated User Storage saves it; if the save fails, the change is dropped and consent is re-read from Authenticated User Storage, the source of truth
  - Add `refresh` method and `MarketingConsentSyncService:refresh` action, which re-read consent from Authenticated User Storage
  - This package replaces `@metamask/marketing-consent-controller`. The service holds no state: the local change waiting to be saved is the `marketingConsentSyncPending` state of `AnalyticsController`, so it requires a version of `@metamask/analytics-controller` that includes it.

[Unreleased]: https://github.com/MetaMask/core/
