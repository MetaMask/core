# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.15.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/profile-sync-controller` from `^2.0.0` to `^3.0.0` ([#5012](https://github.com/MetaMask/core/pull/5012))
- Bump `@metamask/controller-utils` from `^11.4.3` to `^11.4.4` ([#5012](https://github.com/MetaMask/core/pull/5012))

### Fixed

- Correct ESM-compatible build so that imports of the following packages that re-export other modules via `export *` are no longer corrupted: ([#5011](https://github.com/MetaMask/core/pull/5011))
  - `loglevel`
  - `nock`

## [0.14.0]

### Changed

- **BREAKING:** Bump `@metamask/keyring-controller` peer dependency from `^18.0.0` to `^19.0.0` ([#4195](https://github.com/MetaMask/core/pull/4956))
- **BREAKING:** Bump `@metamask/profile-sync-controller` peer dependency from `^1.0.0` to `^2.0.0` ([#4195](https://github.com/MetaMask/core/pull/4956))

## [0.13.0]

### Changed

- **BREAKING:** Bump `@metamask/keyring-controller` peer dependency from `^17.0.0` to `^18.0.0` ([#4195](https://github.com/MetaMask/core/pull/4195))
- **BREAKING:** Bump `@metamask/profile-sync-controller` peer dependency from `^0.9.7` to `^1.0.0` ([#4902](https://github.com/MetaMask/core/pull/4902))
- Bump `@metamask/controller-utils` from `^11.4.2` to `^11.4.3` ([#4195](https://github.com/MetaMask/core/pull/4195))

## [0.12.1]

### Uncategorized

- fix: disable notifications ([#4890](https://github.com/MetaMask/core/pull/4890))
- Release 236.0.0 ([#4870](https://github.com/MetaMask/core/pull/4870))
- Release 233.0.0 ([#4862](https://github.com/MetaMask/core/pull/4862))
- chore: Bump `@metamask/utils` ([#4831](https://github.com/MetaMask/core/pull/4831))

## [0.12.0]

### Added

- Export snap types ([#4836](https://github.com/MetaMask/core/pull/4836))

### Fixed

- fix: add publish event in `deleteNotificationsById` ([#4836](https://github.com/MetaMask/core/pull/4836))

## [0.11.0]

### Added

- Added support for an optional FCM token parameter for push notifications on mobile platforms, allowing native handling of FCM token creation through the Firebase SDK ([#4823](https://github.com/MetaMask/core/pull/4823))

### Changed

- update the types described in `types/on-chain-notification/schema` and `types/on-chain-notification/on-chain-notification` ([#4818](https://github.com/MetaMask/core/pull/4818))

  - adds new notifications: aave_v3_health_factor; ens_expiration; lido_staking_rewards; notional_loan_expiration; rocketpool_staking_rewards; spark_fi_health_factor
  - splits Wallet Notifications from Web 3 Notifications

- updated and added new notification mocks ([#4818](https://github.com/MetaMask/core/pull/4818))
  - can be accessed through `@metamask/notification-services-controller/notification-services/mocks`

### Fixed

- made `updateMetamaskNotificationsList` function work correctly by making the message handler async and moving the publish call outside of the update function. This ensures the `NotificationServicesController:notificationsListUpdated` event is received by the extension ([#4826](https://github.com/MetaMask/core/pull/4826))

## [0.10.0]

### Added

- added the ability for the `fetchFeatureAnnouncementNotifications` function, within the `notification-services-controller`, to fetch draft content from Contentful. This is made possible by passing a `previewToken` parameter ([#4790](https://github.com/MetaMask/core/pull/4790))

### Changed

- update `createMockNotification` functions to provide more realistic data for use in tests and component rendering in Storybook ([#4791](https://github.com/MetaMask/core/pull/4791))

## [0.9.0]

### Added

- Add new functions to create mock notifications ([#4780](https://github.com/MetaMask/core/pull/4780))
  - `createMockNotificationAaveV3HealthFactor`: this function generates a mock notification related to the health factor of an Aave V3 position
  - `createMockNotificationEnsExpiration`: this function creates a mock notification for the expiration of an ENS (Ethereum Name Service) domain
  - `createMockNotificationLidoStakingRewards`: this function produces a mock notification for Lido staking rewards
  - `createMockNotificationNotionalLoanExpiration`: this function generates a mock notification for the expiration of a Notional loan
  - `createMockNotificationSparkFiHealthFactor`: This function produces a mock notification related to the health factor of a SparkFi position

## [0.8.2]

### Added

- Add `resetNotifications` option during the notification creation flow ([#4738](https://github.com/MetaMask/core/pull/4738))

## [0.8.1]

### Changed

- Bump `@metamask/keyring-controller` from `^17.2.1` to `^17.2.2`. ([#4731](https://github.com/MetaMask/core/pull/4731))
- Bump `@metamask/profile-sync-controller` from `^0.9.1` to `^0.9.2`. ([#4731](https://github.com/MetaMask/core/pull/4731))

## [0.8.0]

### Changed

- Update UI export from MATIC to POL ([#4720](https://github.com/MetaMask/core/pull/4720))
- Bump `@metamask/profile-sync-controller` from `^0.8.0` to `^0.8.1` ([#4722]https://github.com/MetaMask/core/pull/4720)

## [0.7.0]

### Changed

- Bump `@metamask/profile-sync-controller` from `^0.7.0` to `^0.8.0` ([#4712](https://github.com/MetaMask/core/pull/4712))

### Fixed

- **BREAKING** use new profile-sync notification settings path hash ([#4711](https://github.com/MetaMask/core/pull/4711))
  - changing this path also means the underlying storage hash has changed. But this will align with our existing solutions that are in prod.

## [0.6.0]

### Changed

- update subpath exports to use new .d.cts definition files. ([#4709](https://github.com/MetaMask/core/pull/4709))
- Bump `@metamask/profile-sync-controller` from `^0.6.0` to `^0.7.0` ([#4710](https://github.com/MetaMask/core/pull/4710))

## [0.5.1]

### Fixed

- Produce and export ESM-compatible TypeScript type declaration files in addition to CommonJS-compatible declaration files ([#4648](https://github.com/MetaMask/core/pull/4648))
  - Previously, this package shipped with only one variant of type declaration
    files, and these files were only CommonJS-compatible, and the `exports`
    field in `package.json` linked to these files. This is an anti-pattern and
    was rightfully flagged by the
    ["Are the Types Wrong?"](https://arethetypeswrong.github.io/) tool as
    ["masquerading as CJS"](https://github.com/arethetypeswrong/arethetypeswrong.github.io/blob/main/docs/problems/FalseCJS.md).
    All of the ATTW checks now pass.
- Remove chunk files ([#4648](https://github.com/MetaMask/core/pull/4648)).
  - Previously, the build tool we used to generate JavaScript files extracted
    common code to "chunk" files. While this was intended to make this package
    more tree-shakeable, it also made debugging more difficult for our
    development teams. These chunk files are no longer present.

## [0.5.0]

### Changed

- move contentful as a dev dependency ([#4673](https://github.com/MetaMask/core/pull/4673))
- update polygon symbol from MATIC to POL ([#4672](https://github.com/MetaMask/core/pull/4672))
- Bump `@metamask/profile-sync-controller` from `^0.4.0` to `^0.5.0` ([#4678](https://github.com/MetaMask/core/pull/4678))

## [0.4.1]

### Fixed

- fix: keep push subscription when wallet is locked ([#4653](https://github.com/MetaMask/core/pull/4653))
  - add `NotificationServicesPushController:subscribeToPushNotifications` event and allowedEvent in `NotificationServicesController`
  - add else check to continue to subscribe to push notifications when wallet is locked

## [0.4.0]

### Changed

- Bump `@metamask/profile-sync-controller` from `^0.3.0` to `^0.4.0` ([#4661](https://github.com/MetaMask/core/pull/4661))

## [0.3.0]

### Added

- passed notification parameter to the `NotificationServicesPushController` `onPushNotificationClicked` config ([#4613](https://github.com/MetaMask/core/pull/4613))
- Define and export new type `NotificationServicesControllerGetStateAction` ([#4633](https://github.com/MetaMask/core/pull/4633))
- Add and export types `NotificationServicesPushControllerGetStateAction`, `NotificationServicesPushControllerStateChangeEvent` ([#4641](https://github.com/MetaMask/core/pull/4641))
- add subpath exports to `@metamask/notification-services-controller` ([#4604](https://github.com/MetaMask/core/pull/4604))
  - add `@metamask/notification-services-controller/notification-services` export
  - add `@metamask/notification-services-controller/push-services` export
- add `TypeExternalLinkFields`, `TypePortfolioLinkFields`, and `TypeMobileLinkFields` types to handle different types of links in feature announcements ([#4620](https://github.com/MetaMask/core/pull/4620))

### Changed

- Bump `typescript` from `~5.1.6` to `~5.2.2` ([#4584](https://github.com/MetaMask/core/pull/4584))
- Bump `@metamask/profile-sync-controller` from `^0.2.1` to `^0.3.0` ([#4657](https://github.com/MetaMask/core/pull/4657))
- Bump `contentful` from `^10.3.6` to `^10.15.0` ([#4637](https://github.com/MetaMask/core/pull/4637))
- **BREAKING:** Rename `NotificationServicesPushControllerPushNotificationClicked` type to `NotificationServicesPushControllerPushNotificationClickedEvent` ([#4641](https://github.com/MetaMask/core/pull/4641))
- **BREAKING:** Narrow `AllowedEvents` type for `NotificationServicesPushControllerMessenger` to `never` ([#4641](https://github.com/MetaMask/core/pull/4641))
- updated `NotificationServicesPushControllerMessenger` must allow internal event `NotificationServicesPushControllerStateChangeEvent` ([#4641](https://github.com/MetaMask/core/pull/4641))
- updated `FeatureAnnouncementRawNotificationData` to include fields for external, portfolio, and mobile links ([#4620](https://github.com/MetaMask/core/pull/4620))
- updated `TypeFeatureAnnouncementFields` to include fields for external, portfolio, and mobile links ([#4620](https://github.com/MetaMask/core/pull/4620))
- updated `fetchFeatureAnnouncementNotifications` to handle the new link types and include them in the notification data.

### Fixed

- Replace `getState` action in `NotificationServicesControllerActions` with correctly-defined `NotificationServicesControllerGetStateAction` type ([#4633](https://github.com/MetaMask/core/pull/4633))
- **BREAKING:** Fix package-level export for `NotificationServicesPushController` from "NotificationsServicesPushController" to "NotificationsServicesPushController" ([#4641](https://github.com/MetaMask/core/pull/4641))
- **BREAKING:** Replace incorrectly-defined `getState` action in the `Actions` type for `NotificationServicesPushControllerMessenger` with new `NotificationServicesPushControllerGetStateAction` type ([#4641](https://github.com/MetaMask/core/pull/4641))
- update subpath exports internal `package.json` files to resolve `jest-haste-map` errors ([#4650](https://github.com/MetaMask/core/pull/4650))
- removed unnecessary subpath exports ([#4650](https://github.com/MetaMask/core/pull/4650))
  - removed `/constants`, `/services`, `/processors`, `/utils` sub paths as these are navigable from root.

## [0.2.1]

### Added

- new controller events when notifications list is updated or notifications are read ([#4573](https://github.com/MetaMask/core/pull/4573))
- unlock checks for when controller methods are called ([#4569](https://github.com/MetaMask/core/pull/4569))

### Changed

- updated controller event type names ([#4592](https://github.com/MetaMask/core/pull/4592))
- Bump `typescript` from `~5.0.4` to `~5.1.6` ([#4576](https://github.com/MetaMask/core/pull/4576))

## [0.2.0]

### Added

- Add and export type `BlockExplorerConfig` and object `SUPPORTED_NOTIFICATION_BLOCK_EXPLORERS`, which is a collection of block explorers for chains on which notifications are supported ([#4552](https://github.com/MetaMask/core/pull/4552))

### Changed

- **BREAKING:** Bump peerDependency `@metamask/profile-sync-controller` from `^0.1.4` to `^0.2.0` ([#4548](https://github.com/MetaMask/core/pull/4548))
- Remove `@metamask/keyring-controller` and `@metamask/profile-sync-controller` dependencies [#4556](https://github.com/MetaMask/core/pull/4556)
  - These were listed under `peerDependencies` already, so they were redundant as dependencies.
- Upgrade TypeScript version to `~5.0.4` and set `moduleResolution` option to `Node16` ([#3645](https://github.com/MetaMask/core/pull/3645))
- Bump `@metamask/base-controller` from `^6.0.1` to `^6.0.2` ([#4544](https://github.com/MetaMask/core/pull/4544))
- Bump `@metamask/controller-utils` from `^11.0.1` to `^11.0.2` ([#4544](https://github.com/MetaMask/core/pull/4544))

## [0.1.2]

### Added

- added catch statements in NotificationServicesController to silently fail push notifications ([#4536](https://github.com/MetaMask/core/pull/4536))

- added checks to see feature announcement environments before fetching announcements ([#4530](https://github.com/MetaMask/core/pull/4530))

### Removed

- removed retries when fetching announcements and wallet notifications. Clients are to handle retries now. ([#4531](https://github.com/MetaMask/core/pull/4531))

## [0.1.1]

### Added

- export `defaultState` for `NotificationServicesController` and `NotificationServicesPushController`. ([#4441](https://github.com/MetaMask/core/pull/4441))

- export `NOTIFICATION_CHAINS_ID` which is a const-asserted version of `NOTIFICATION_CHAINS` ([#4441](https://github.com/MetaMask/core/pull/4441))

- export `NOTIFICATION_NETWORK_CURRENCY_NAME` and `NOTIFICATION_NETWORK_CURRENCY_SYMBOL`. Allows consistent currency names and symbols for supported notification services ([#4441](https://github.com/MetaMask/core/pull/4441))

- add `isPushIntegrated` as an optional env property in the `NotificationServicesController` constructor (defaults to true) ([#4441](https://github.com/MetaMask/core/pull/4441))

### Fixed

- `NotificationServicesPushController` - removed global `self` calls for mobile compatibility ([#4441](https://github.com/MetaMask/core/pull/4441))

## [0.1.0]

### Added

- Initial release

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/notification-services-controller@0.15.0...HEAD
[0.15.0]: https://github.com/MetaMask/core/compare/@metamask/notification-services-controller@0.14.0...@metamask/notification-services-controller@0.15.0
[0.14.0]: https://github.com/MetaMask/core/compare/@metamask/notification-services-controller@0.13.0...@metamask/notification-services-controller@0.14.0
[0.13.0]: https://github.com/MetaMask/core/compare/@metamask/notification-services-controller@0.12.1...@metamask/notification-services-controller@0.13.0
[0.12.1]: https://github.com/MetaMask/core/compare/@metamask/notification-services-controller@0.12.0...@metamask/notification-services-controller@0.12.1
[0.12.0]: https://github.com/MetaMask/core/compare/@metamask/notification-services-controller@0.11.0...@metamask/notification-services-controller@0.12.0
[0.11.0]: https://github.com/MetaMask/core/compare/@metamask/notification-services-controller@0.10.0...@metamask/notification-services-controller@0.11.0
[0.10.0]: https://github.com/MetaMask/core/compare/@metamask/notification-services-controller@0.9.0...@metamask/notification-services-controller@0.10.0
[0.9.0]: https://github.com/MetaMask/core/compare/@metamask/notification-services-controller@0.8.2...@metamask/notification-services-controller@0.9.0
[0.8.2]: https://github.com/MetaMask/core/compare/@metamask/notification-services-controller@0.8.1...@metamask/notification-services-controller@0.8.2
[0.8.1]: https://github.com/MetaMask/core/compare/@metamask/notification-services-controller@0.8.0...@metamask/notification-services-controller@0.8.1
[0.8.0]: https://github.com/MetaMask/core/compare/@metamask/notification-services-controller@0.7.0...@metamask/notification-services-controller@0.8.0
[0.7.0]: https://github.com/MetaMask/core/compare/@metamask/notification-services-controller@0.6.0...@metamask/notification-services-controller@0.7.0
[0.6.0]: https://github.com/MetaMask/core/compare/@metamask/notification-services-controller@0.5.1...@metamask/notification-services-controller@0.6.0
[0.5.1]: https://github.com/MetaMask/core/compare/@metamask/notification-services-controller@0.5.0...@metamask/notification-services-controller@0.5.1
[0.5.0]: https://github.com/MetaMask/core/compare/@metamask/notification-services-controller@0.4.1...@metamask/notification-services-controller@0.5.0
[0.4.1]: https://github.com/MetaMask/core/compare/@metamask/notification-services-controller@0.4.0...@metamask/notification-services-controller@0.4.1
[0.4.0]: https://github.com/MetaMask/core/compare/@metamask/notification-services-controller@0.3.0...@metamask/notification-services-controller@0.4.0
[0.3.0]: https://github.com/MetaMask/core/compare/@metamask/notification-services-controller@0.2.1...@metamask/notification-services-controller@0.3.0
[0.2.1]: https://github.com/MetaMask/core/compare/@metamask/notification-services-controller@0.2.0...@metamask/notification-services-controller@0.2.1
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/notification-services-controller@0.1.2...@metamask/notification-services-controller@0.2.0
[0.1.2]: https://github.com/MetaMask/core/compare/@metamask/notification-services-controller@0.1.1...@metamask/notification-services-controller@0.1.2
[0.1.1]: https://github.com/MetaMask/core/compare/@metamask/notification-services-controller@0.1.0...@metamask/notification-services-controller@0.1.1
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/notification-services-controller@0.1.0
