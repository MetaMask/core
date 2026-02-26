# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- feat!: Expose Accounts-owned controller/service methods through messenger ([#7976](https://github.com/MetaMask/core/pull/7976))
- chore: secure PUBLISH_PREVIEW_NPM_TOKEN with GitHub environment ([#8011](https://github.com/MetaMask/core/pull/8011))
- chore(subscription-controller): replace Sinon with Jest fake timers ([#7974](https://github.com/MetaMask/core/pull/7974))
- chore: upgrade `typedoc` from `^0.24.8` to `^0.25.13` ([#7898](https://github.com/MetaMask/core/pull/7898))
- chore: migrate Jest from v27 to v29 ([#7894](https://github.com/MetaMask/core/pull/7894))

### Changed

- Bump `@metamask/transaction-controller` from `^62.16.0` to `^62.19.0` ([#7897](https://github.com/MetaMask/core/pull/7897), [#7996](https://github.com/MetaMask/core/pull/7996), [#8005](https://github.com/MetaMask/core/pull/8005), [#8031](https://github.com/MetaMask/core/pull/8031))
- Bump `@metamask/polling-controller` from `^16.0.2` to `^16.0.3` ([#7996](https://github.com/MetaMask/core/pull/7996))
- Bump `@metamask/controller-utils` from `^11.18.0` to `^11.19.0` ([#7995](https://github.com/MetaMask/core/pull/7995))

## [6.0.0]

### Added

- **BREAKING**: Added two new params, `captureException` and `fetchFunction` to `SubscriptionService` constructor args. ([#7835](https://github.com/MetaMask/core/pull/7835))
  - `fetchFunction` is to use the client provided `Fetch` API.
  - `captureException` is to capture the error thrown and report to Sentry.

### Changed

- Updated `SubscriptionServiceError` to include more information for Sentry reporting. ([#7835](https://github.com/MetaMask/core/pull/7835))
- Bump `@metamask/profile-sync-controller` from `^27.0.0` to `^27.1.0` ([#7849](https://github.com/MetaMask/core/pull/7849))
- Bump `@metamask/transaction-controller` from `^62.12.0` to `^62.16.0` ([#7802](https://github.com/MetaMask/core/pull/7802), [#7832](https://github.com/MetaMask/core/pull/7832), [#7854](https://github.com/MetaMask/core/pull/7854), [#7872](https://github.com/MetaMask/core/pull/7872))

## [5.4.2]

### Added

- Added new public method `clearState` to clear/reset the subscription controller state. ([#7780](https://github.com/MetaMask/core/pull/7780))
- Added SubscriptionController `clearLastSelectedPaymentMethod` method ([#7768](https://github.com/MetaMask/core/pull/7768))

### Changed

- Bump `@metamask/transaction-controller` from `^62.9.2` to `^62.12.0` ([#7737](https://github.com/MetaMask/core/pull/7737), [#7760](https://github.com/MetaMask/core/pull/7760), [#7775](https://github.com/MetaMask/core/pull/7775))

## [5.4.1]

### Added

- Added `CancelType` to `Subscription` and `CancelSubscriptionRequest` for `cancelSubscription` method ([#7720](https://github.com/MetaMask/core/pull/7720))
- Added `cancelUrl` property to `StartSubscriptionRequest` and `UpdatePaymentMethodCardRequest` ([#7719](https://github.com/MetaMask/core/pull/7719))

### Changed

- Bump `@metamask/polling-controller` from `^16.0.0` to `^16.0.2` ([#7604](https://github.com/MetaMask/core/pull/7604), [#7642](https://github.com/MetaMask/core/pull/7642))
- Bump `@metamask/transaction-controller` from `^62.4.0` to `^62.9.2` ([#7325](https://github.com/MetaMask/core/pull/7325), [#7430](https://github.com/MetaMask/core/pull/7430), [#7494](https://github.com/MetaMask/core/pull/7494), [#7596](https://github.com/MetaMask/core/pull/7596), [#7602](https://github.com/MetaMask/core/pull/7602), [#7604](https://github.com/MetaMask/core/pull/7604), [#7642](https://github.com/MetaMask/core/pull/7642))
- Bump `@metamask/utils` from `^11.8.1` to `^11.9.0` ([#7511](https://github.com/MetaMask/core/pull/7511))
- Bump `@metamask/controller-utils` from `^11.16.0` to `^11.18.0` ([#7534](https://github.com/MetaMask/core/pull/7534), [#7583](https://github.com/MetaMask/core/pull/7583))

## [5.4.0]

### Changed

- Updated `GetSubscriptionsResponse` and controller state to include `rewardAccountId` property ([#7319](https://github.com/MetaMask/core/pull/7319))

## [5.3.1]

### Changed

- Renamed parameters related to rewards linking with shield. ([#7311](https://github.com/MetaMask/core/pull/7311))
  - Renamed from `rewardSubscriptionId` to `rewardAccountId`.

## [5.3.0]

### Added

- Added new method, `linkRewards` to link rewards to the existing subscription. ([#7283](https://github.com/MetaMask/core/pull/7283))
- Added an optional param, `rewardSubscriptionId` to start subscription requests to opt in to rewards together with the main subscription. ([#7283](https://github.com/MetaMask/core/pull/7283))
- Added an option param, `rewardSubscriptionId` in `submitShieldSubscriptionCryptoApproval` to support rewards with crypto subscriptions. ([#7298](https://github.com/MetaMask/core/pull/7298))
- Added `SubscriptionControllerSubmitShieldSubscriptionCryptoApprovalAction` and `SubscriptionControllerLinkRewardsAction` to exports. ([#7298](https://github.com/MetaMask/core/pull/7298))

### Changed

- Bump `@metamask/transaction-controller` from `^62.3.1` to `^62.4.0` ([#7289](https://github.com/MetaMask/core/pull/7289))

## [5.2.0]

### Added

- Added `minBillingCyclesForBalance` property to `ProductPrice` type ([#7269](https://github.com/MetaMask/core/pull/7269))
- Added `getTokenMinimumBalanceAmount` method to `SubscriptonController` ([#7269](https://github.com/MetaMask/core/pull/7269))

### Changed

- Bump `@metamask/transaction-controller` from `^62.3.0` to `^62.3.1` ([#7257](https://github.com/MetaMask/core/pull/7257))

## [5.1.0]

### Changed

- Removed `minBalanceUSD` field from the `SubscriptionEligibility` type. ([#7248](https://github.com/MetaMask/core/pull/7248))
- Updated `submitShieldSubscriptionCryptoApproval` to handle change payment method transaction if subscription already existed ([#7231](https://github.com/MetaMask/core/pull/7231))
- Bump `@metamask/transaction-controller` from `^62.0.0` to `^62.3.0` ([#7215](https://github.com/MetaMask/core/pull/7215), [#7220](https://github.com/MetaMask/core/pull/7220), [#7236](https://github.com/MetaMask/core/pull/7236))
- Move peer dependencies for controller and service packages to direct dependencies ([#7209](https://github.com/MetaMask/core/pull/7209))
  - The dependencies moved are:
    - `@metamask/profile-sync-controller` (^27.0.0)
  - In clients, it is now possible for multiple versions of these packages to exist in the dependency tree.
    - For example, this scenario would be valid: a client relies on `@metamask/controller-a` 1.0.0 and `@metamask/controller-b` 1.0.0, and `@metamask/controller-b` depends on `@metamask/controller-a` 1.1.0.
  - Note, however, that the versions specified in the client's `package.json` always "win", and you are expected to keep them up to date so as not to break controller and service intercommunication.

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/subscription-controller@6.0.0...HEAD
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/subscription-controller@5.4.2...@metamask/subscription-controller@6.0.0
[5.4.2]: https://github.com/MetaMask/core/compare/@metamask/subscription-controller@5.4.1...@metamask/subscription-controller@5.4.2
[5.4.1]: https://github.com/MetaMask/core/compare/@metamask/subscription-controller@5.4.0...@metamask/subscription-controller@5.4.1
[5.4.0]: https://github.com/MetaMask/core/compare/@metamask/subscription-controller@5.3.1...@metamask/subscription-controller@5.4.0
[5.3.1]: https://github.com/MetaMask/core/compare/@metamask/subscription-controller@5.3.0...@metamask/subscription-controller@5.3.1
[5.3.0]: https://github.com/MetaMask/core/compare/@metamask/subscription-controller@5.2.0...@metamask/subscription-controller@5.3.0
[5.2.0]: https://github.com/MetaMask/core/compare/@metamask/subscription-controller@5.1.0...@metamask/subscription-controller@5.2.0
[5.1.0]: https://github.com/MetaMask/core/compare/@metamask/subscription-controller@5.0.0...@metamask/subscription-controller@5.1.0
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
