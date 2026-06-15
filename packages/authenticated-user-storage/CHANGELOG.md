# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `getAssetsWatchlist` and `setAssetsWatchlist` methods to `AuthenticatedUserStorageService` for managing the authenticated user's assets-watchlist, along with corresponding messenger actions (`AuthenticatedUserStorageService:getAssetsWatchlist`, `AuthenticatedUserStorageService:setAssetsWatchlist`), the `AssetsWatchlistBlob` type, and the `ASSETS_WATCHLIST_MAX_ASSETS` constant ([#8836](https://github.com/MetaMask/core/pull/8836))
  - `getAssetsWatchlist` returns the assets-watchlist blob or `null` on 404, mirroring `getNotificationPreferences`.
  - `setAssetsWatchlist` writes the full blob and enforces a maximum of `ASSETS_WATCHLIST_MAX_ASSETS` (100) assets before sending the request, via a superstruct `size` constraint on the write-side schema.

### Changed

- **BREAKING:** Add required `agenticCli` field to `NotificationPreferences`, along with the `AgenticCliPreference` type and `NotificationPreferencesSchema` validation for Agentic CLI notification preferences ([#8933](https://github.com/MetaMask/core/pull/8933))
- Bump `@metamask/utils` from `^11.9.0` to `^11.11.0` ([#9074](https://github.com/MetaMask/core/pull/9074))
- Bump `@metamask/controller-utils` from `^12.1.0` to `^12.2.0` ([#9058](https://github.com/MetaMask/core/pull/9058), [#9083](https://github.com/MetaMask/core/pull/9083))

## [2.0.0]

### Changed

- Bump `@metamask/controller-utils` from `^12.0.0` to `^12.1.0` ([#8774](https://github.com/MetaMask/core/pull/8774))
- Bump `@metamask/base-data-service` from `^0.1.2` to `^0.1.3` ([#8799](https://github.com/MetaMask/core/pull/8799))
- **BREAKING:** Replace `enabled` by `inAppNotificationsEnabled` and `pushNotificationsEnabled` in all the `NotificationPreferences` type fields and validation to match the API payload. ([#8784](https://github.com/MetaMask/core/pull/8784))

## [1.0.1]

### Changed

- Bump `@metamask/messenger` from `^1.1.1` to `^1.2.0` ([#8632](https://github.com/MetaMask/core/pull/8632))
- Bump `@metamask/base-data-service` from `^0.1.1` to `^0.1.2` ([#8755](https://github.com/MetaMask/core/pull/8755))
- Bump `@metamask/controller-utils` from `^11.20.0` to `^12.0.0` ([#8755](https://github.com/MetaMask/core/pull/8755))

## [1.0.0]

### Added

- Initial release ([#8260](https://github.com/MetaMask/core/pull/8260))
  - `AuthenticatedUserStorageService` class with namespaced domain accessors: `delegations` (list, create, revoke) and `preferences` (getNotifications, putNotifications)

### Changed

- **BREAKING**: Rename `SocialAIPreference.traderProfileIds` to `mutedTraderProfileIds` in types and notification-preferences validation to match the API payload. ([#8536](https://github.com/MetaMask/core/pull/8536))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/authenticated-user-storage@2.0.0...HEAD
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/authenticated-user-storage@1.0.1...@metamask/authenticated-user-storage@2.0.0
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/authenticated-user-storage@1.0.0...@metamask/authenticated-user-storage@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/authenticated-user-storage@1.0.0
