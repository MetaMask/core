# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [5.0.0]

### Changed

- Bump `@metamask/polling-controller` from `^15.0.0` to `^16.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- Bump `@metamask/controller-utils` from `^11.15.0` to `^11.16.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- **BREAKING:** Bump `@metamask/profile-sync-controller` from `^26.0.0` to `^27.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- Bump `@metamask/transaction-controller` from `^61.3.0` to `^62.0.0` ([#7153](https://github.com/MetaMask/core/pull/7153), [#7202](https://github.com/MetaMask/core/pull/7202))

## [4.2.2]

### Changed

- Trigger `triggerAccessTokenRefresh` everytime subscription state change instead of only when polling ([#7149](https://github.com/MetaMask/core/pull/7149))
- Remove `triggerAccessTokenRefresh` after `startShieldSubscriptionWithCard` ([#7149](https://github.com/MetaMask/core/pull/7149))

## [4.2.1]

### Added

- Add missing start crypto `useTestClock` param from `lastSelectedPaymentMethod` in `submitShieldSubscriptionCryptoApproval` ([#7131](https://github.com/MetaMask/core/pull/7131))

## [4.2.0]

### Added

- added `useTestClock` param to `StartSubscriptionRequest`, `StartCryptoSubscriptionRequest`, `CachedLastSelectedPaymentMethod` ([#7129](https://github.com/MetaMask/core/pull/7129))

### Changed

- Bump `@metamask/transaction-controller` from `^61.1.0` to `^61.2.0` ([#7126](https://github.com/MetaMask/core/pull/7126))

## [4.1.0]

### Added

- Added `modalType` field and constant to `SubscriptionEligibility` ([#7124](https://github.com/MetaMask/core/pull/7124))

## [4.0.0]

### Added

- Added `lastSubscription` in state returned from `getSubscriptions` method ([#7110](https://github.com/MetaMask/core/pull/7110))
- Add `assignUserToCohort` method to assign users to cohorts via backend API ([#7099](https://github.com/MetaMask/core/pull/7099))
- Add cohort-related types: `Cohort`, `CohortName`, `BalanceCategory`, `AssignCohortRequest`, `GetSubscriptionsEligibilitiesRequest` ([#7099](https://github.com/MetaMask/core/pull/7099))
- Add cohort-related constants: `COHORT_NAMES`, `BALANCE_CATEGORIES`, `SubscriptionUserEvent` ([#7099](https://github.com/MetaMask/core/pull/7099))
- Add cohort fields to `SubscriptionEligibility` type: `cohorts`, `assignedCohort`, `hasAssignedCohortExpired` ([#7099](https://github.com/MetaMask/core/pull/7099))
- Add `ShieldCohortAssigned` event to `SubscriptionUserEvent` ([#7099](https://github.com/MetaMask/core/pull/7099))
- Add optional `balanceCategory` parameter to `getSubscriptionsEligibilities` for privacy-preserving balance evaluation ([#7099](https://github.com/MetaMask/core/pull/7099))
- Add optional `cohort` field to `SubmitUserEventRequest` for event tracking ([#7099](https://github.com/MetaMask/core/pull/7099))

### Changed

- Refactor `SubscriptionService.makeRequest` to accept query parameters for cleaner URL construction ([#7099](https://github.com/MetaMask/core/pull/7099))

## [3.3.0]

### Changed

- fix: `getTokenApproveAmount` precision by using bignumber.js ([#7070](https://github.com/MetaMask/core/pull/7070))

## [3.2.0]

### Added

- Added new property, `isSponsorshipSupported` to the ControllerState, `pricing.paymentMethods.chains`. ([#7035](https://github.com/MetaMask/core/pull/7035))
- Added `SubscriptionControllerSubmitSponsorshipIntentsAction` in the controller exports. ([#7037](https://github.com/MetaMask/core/pull/7037))

### Changed

- Bump `@metamask/controller-utils` from `^11.14.1` to `^11.15.0`. ([#7003](https://github.com/MetaMask/core/pull/7003))
- Bump `@metamask/transaction-controller` from `^61.0.0` to `^61.1.0` ([#7007](https://github.com/MetaMask/core/pull/7007))
- Updated `submitSponsorshipIntents` method with chain validation. ([#7035](https://github.com/MetaMask/core/pull/7035))

## [3.1.0]

### Added

- Added new public method `submitShieldSubscriptionCryptoApproval`, to submit shield crypto approval transaction ([#6945](https://github.com/MetaMask/core/pull/6945))
- Added the new controller state, `lastSelectedPaymentMethod`. ([#6946](https://github.com/MetaMask/core/pull/6946))
  - We will use this in the UI state persistence between navigation.
  - We will use this to query user subscription plan details in subscribe methods internally.
- Added new public method, `submitSponsorshipIntents`, to submit sponsorship intents for the new subscription with crypto. ([#6898](https://github.com/MetaMask/core/pull/6898))

## [3.0.0]

### Changed

- **BREAKING:** Use new `Messenger` from `@metamask/messenger` ([#6444](https://github.com/MetaMask/core/pull/6444))
  - Previously, `SubscriptionController` accepted a `RestrictedMessenger` instance from `@metamask/base-controller`.
- **BREAKING:** Bump `@metamask/profile-sync-controller` from `^25.0.0` to `^26.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))
- Bump `@metamask/base-controller` from `^8.4.2` to `^9.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))
- Bump `@metamask/polling-controller` from `^14.0.1` to `^15.0.0` ([#6940](https://github.com/MetaMask/core/pull/6940), [#6962](https://github.com/MetaMask/core/pull/6962))

## [2.1.0]

### Changed

- Make `getCryptoApproveTransactionParams` synchronous ([#6930](https://github.com/MetaMask/core/pull/6930))
- Bump `@metamask/base-controller` from `^8.4.1` to `^8.4.2` ([#6917](https://github.com/MetaMask/core/pull/6917))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/subscription-controller@5.0.0...HEAD
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/subscription-controller@4.2.2...@metamask/subscription-controller@5.0.0
[4.2.2]: https://github.com/MetaMask/core/compare/@metamask/subscription-controller@4.2.1...@metamask/subscription-controller@4.2.2
[4.2.1]: https://github.com/MetaMask/core/compare/@metamask/subscription-controller@4.2.0...@metamask/subscription-controller@4.2.1
[4.2.0]: https://github.com/MetaMask/core/compare/@metamask/subscription-controller@4.1.0...@metamask/subscription-controller@4.2.0
[4.1.0]: https://github.com/MetaMask/core/compare/@metamask/subscription-controller@4.0.0...@metamask/subscription-controller@4.1.0
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/subscription-controller@3.3.0...@metamask/subscription-controller@4.0.0
[3.3.0]: https://github.com/MetaMask/core/compare/@metamask/subscription-controller@3.2.0...@metamask/subscription-controller@3.3.0
[3.2.0]: https://github.com/MetaMask/core/compare/@metamask/subscription-controller@3.1.0...@metamask/subscription-controller@3.2.0
[3.1.0]: https://github.com/MetaMask/core/compare/@metamask/subscription-controller@3.0.0...@metamask/subscription-controller@3.1.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/subscription-controller@2.1.0...@metamask/subscription-controller@3.0.0
[2.1.0]: https://github.com/MetaMask/core/compare/@metamask/subscription-controller@2.0.0...@metamask/subscription-controller@2.1.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/subscription-controller@1.1.0...@metamask/subscription-controller@2.0.0
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/subscription-controller@1.0.1...@metamask/subscription-controller@1.1.0
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/subscription-controller@1.0.0...@metamask/subscription-controller@1.0.1
[1.0.0]: https://github.com/MetaMask/core/compare/@metamask/subscription-controller@0.5.0...@metamask/subscription-controller@1.0.0
[0.5.0]: https://github.com/MetaMask/core/compare/@metamask/subscription-controller@0.4.0...@metamask/subscription-controller@0.5.0
[0.4.0]: https://github.com/MetaMask/core/compare/@metamask/subscription-controller@0.3.0...@metamask/subscription-controller@0.4.0
[0.3.0]: https://github.com/MetaMask/core/compare/@metamask/subscription-controller@0.2.0...@metamask/subscription-controller@0.3.0
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/subscription-controller@0.1.0...@metamask/subscription-controller@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/subscription-controller@0.1.0
