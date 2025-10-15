# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0]

### Added

- **BREAKING**: Added two new public methods, `getSubscriptionsEligibilities` and `submitUserEvent` to `SubscriptionService` and `ISubscriptionService` interface. ([#6826](https://github.com/MetaMask/core/pull/6826))
  - `getSubscriptionsEligibilities` (get user eligibilities for subscriptions).
  - `submitUserEvent` (submit user UI events, e.g. EntryModalViewed).
- Added two new public methods, `getSubscriptionsEligibilities` and `submitUserEvent` to controller. ([#6826](https://github.com/MetaMask/core/pull/6826))
- Exported `SubscriptionUserEvent` from the Controller. ([#6826](https://github.com/MetaMask/core/pull/6826))

## [1.1.0] [DEPRECATED]

### Added

- **BREAKING**: Added two new public methods, `getSubscriptionsEligibilities` and `submitUserEvent` to `SubscriptionService` and `ISubscriptionService` interface. ([#6826](https://github.com/MetaMask/core/pull/6826))
  - `getSubscriptionsEligibilities` (get user eligibilities for subscriptions).
  - `submitUserEvent` (submit user UI events, e.g. EntryModalViewed).
- Added two new public methods, `getSubscriptionsEligibilities` and `submitUserEvent` to controller. ([#6826](https://github.com/MetaMask/core/pull/6826))
- Exported `SubscriptionUserEvent` from the Controller. ([#6826](https://github.com/MetaMask/core/pull/6826))

## [1.0.1]

### Changed

- Bump `@metamask/base-controller` from `^8.4.0` to `^8.4.1` ([#6807](https://github.com/MetaMask/core/pull/6807))
- Bump `@metamask/controller-utils` from `^11.14.0` to `^11.14.1` ([#6807](https://github.com/MetaMask/core/pull/6807))
- Bump `@metamask/polling-controller` from `^14.0.0` to `^14.0.1` ([#6807](https://github.com/MetaMask/core/pull/6807))

## [1.0.0]

### Added

- Added new public method, `getSubscriptionByProduct` which accepts `product` name as parameter and return the relevant subscription. ([#6770](https://github.com/MetaMask/core/pull/6770))

### Changed

- Updated controller exports. ([#6785](https://github.com/MetaMask/core/pull/6785))
  - PaymentMethod types (`CryptoPaymentMethodError`, `UpdatePaymentMethodCryptoRequest`, `UpdatePaymentMethodCardRequest`, `UpdatePaymentMethodCardResponse`).
  - PaymentMethod error constants, `CRYPTO_PAYMENT_METHOD_ERRORS`.
- **BREAKING**: The `SubscriptionController` now extends `StaticIntervalPollingController`, and the new polling API `startPolling` must be used to initiate polling (`startPolling`, `stopPollingByPollingToken`). ([#6770](https://github.com/MetaMask/core/pull/6770))
- **BREAKING**: The `SubscriptionController` now accepts an optional `pollingInterval` property in the constructor argument, to enable the configurable polling interval. ([#6770](https://github.com/MetaMask/core/pull/6770))
- Prevent unnecessary state updates to avoid emitting `:stateChange` in `getSubscriptions` method. ([#6770](https://github.com/MetaMask/core/pull/6770))

## [0.5.0]

### Changed

- Get pricing from state instead of fetching pricing from server in `getCryptoApproveTransactionParams` ([#6735](https://github.com/MetaMask/core/pull/6735))
- Bump `@metamask/utils` from `^11.8.0` to `^11.8.1` ([#6708](https://github.com/MetaMask/core/pull/6708))

## [0.4.0]

### Changed

- `updatePaymentMethod` return `redirectUrl` for card payment ([#6726](https://github.com/MetaMask/core/pull/6726))

## [0.3.0]

### Added

- Add `CryptoPaymentMethodError` error response to `SubscriptionCryptoPaymentMethod` ([#6720](https://github.com/MetaMask/core/pull/6720))

### Changed

- Make `rawTransaction` in `UpdatePaymentMethodCryptoRequest` optional for top up case ([#6720](https://github.com/MetaMask/core/pull/6720))

## [0.2.0]

### Changed

- Added `displayBrand` in card payment type ([#6669](https://github.com/MetaMask/core/pull/6669))
- Added optional `successUrl` param in start subscription with card ([#6669](https://github.com/MetaMask/core/pull/6669))
- Bump `@metamask/base-controller` from `^8.3.0` to `^8.4.0` ([#6632](https://github.com/MetaMask/core/pull/6632))

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

- Bump `@metamask/controller-utils` from `^11.12.0` to `^11.14.0` ([#6620](https://github.com/MetaMask/core/pull/6620), [#6629](https://github.com/MetaMask/core/pull/6629))
- Bump `@metamask/utils` from `^11.4.2` to `^11.8.0` ([#6588](https://github.com/MetaMask/core/pull/6588))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/subscription-controller@2.0.0...HEAD
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/subscription-controller@1.1.0...@metamask/subscription-controller@2.0.0
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/subscription-controller@1.0.1...@metamask/subscription-controller@1.1.0
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/subscription-controller@1.0.0...@metamask/subscription-controller@1.0.1
[1.0.0]: https://github.com/MetaMask/core/compare/@metamask/subscription-controller@0.5.0...@metamask/subscription-controller@1.0.0
[0.5.0]: https://github.com/MetaMask/core/compare/@metamask/subscription-controller@0.4.0...@metamask/subscription-controller@0.5.0
[0.4.0]: https://github.com/MetaMask/core/compare/@metamask/subscription-controller@0.3.0...@metamask/subscription-controller@0.4.0
[0.3.0]: https://github.com/MetaMask/core/compare/@metamask/subscription-controller@0.2.0...@metamask/subscription-controller@0.3.0
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/subscription-controller@0.1.0...@metamask/subscription-controller@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/subscription-controller@0.1.0
