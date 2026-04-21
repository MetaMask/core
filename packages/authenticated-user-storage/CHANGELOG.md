# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- Revert "Update Release 929.0.0" ([#8539](https://github.com/MetaMask/core/pull/8539))
- Update Release 929.0.0 ([#8538](https://github.com/MetaMask/core/pull/8538))

### Added

- Initial release ([#8260](https://github.com/MetaMask/core/pull/8260))
  - `AuthenticatedUserStorageService` class with namespaced domain accessors: `delegations` (list, create, revoke) and `preferences` (getNotifications, putNotifications)

### Changed

- **BREAKING**: Rename `SocialAIPreference.traderProfileIds` to `mutedTraderProfileIds` in types and notification-preferences validation to match the API payload. ([#8536](https://github.com/MetaMask/core/pull/8536))

[Unreleased]: https://github.com/MetaMask/core/
