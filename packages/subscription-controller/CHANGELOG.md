# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0]

### Added

- Initial release of the subscription controller ([#6233](https://github.com/MetaMask/core/pull/6233))
  - `getSubscription`: Retrieve current user subscription info if exist.
  - `cancelSubscription`: Cancel user active subscription.
- `startShieldSubscriptionWithCard`: start shield subscription via card (with trial option) ([#6300](https://github.com/MetaMask/core/pull/6300))
- Add `getPricing` method ([#6356](https://github.com/MetaMask/core/pull/6356))
- Add methods `startSubscriptionWithCrypto` and `getCryptoApproveTransactionParams` method ([#6456](https://github.com/MetaMask/core/pull/6456))
- Added `triggerAccessTokenRefresh` to trigger an access token refresh ([#6374](https://github.com/MetaMask/core/pull/6374))
- Add two new controller state metadata properties: `includeInStateLogs` and `usedInUi` ([#6504](https://github.com/MetaMask/core/pull/6504))
- Added `updatePaymentMethodCard` and `updatePaymentMethodCrypto` methods ([#6539](https://github.com/MetaMask/core/pull/6539))
- Added `getBillingPortalUrl` method ([#6580](https://github.com/MetaMask/core/pull/6580))
- Added `unCancelSubscription` method ([#6596](https://github.com/MetaMask/core/pull/6596))

### Changed

- Bump `@metamask/controller-utils` from `^11.12.0` to `^11.13.0` ([#6620](https://github.com/MetaMask/core/pull/6620))
- Bump `@metamask/utils` from `^11.4.2` to `^11.8.0` ([#6588](https://github.com/MetaMask/core/pull/6588))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/subscription-controller@0.1.0...HEAD
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/subscription-controller@0.1.0
