# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.1]

### Changed

- Bump `@metamask/profile-sync-controller` from `^33.0.0` to `^34.0.0` ([#10662](https://github.com/MetaMask/core/pull/10662))

## [1.0.0]

### Added

- Add `ProfileController` for managing user profile state, exposing `getMetaMaskProfile`, `getXprofile`, `createProfile`, `replaceProfile`, `updateProfile`, `deleteProfile`, `checkUsernameAvailability`, `getXAuthUrl`, `connectX`, and `getXAccount` via the messenger ([#10558](https://github.com/MetaMask/core/pull/10558))
- Add `ProfileService` for communicating with the MetaMask Profile API, exposing `getProfile`, `createProfile`, `replaceProfile`, `updateProfile`, `deleteProfile`, `checkUsernameAvailability`, `getXAuthUrl`, `connectX`, and `getXAccount` via the messenger, with superstruct validation on all inputs and responses ([#10558](https://github.com/MetaMask/core/pull/10558))
- Add `startXConnect` method to `ProfileController` for initiating the X OAuth flow. It fetches the authorization URL via `ProfileService:getXAuthUrl` (the profile is resolved server-side from the verified bearer token) and returns the authorization URL and state parameter as ephemeral session data, without storing them in controller state ([#0000](https://github.com/MetaMask/core/pull/0000))
- Add `disconnectX` method to `ProfileController` for unlinking the X account from a profile. It delegates to `ProfileService:disconnectX`, clears `xProfile` from controller state, and sets `connectedToX` to `false` when the disconnected profile matches the profile in state ([#0000](https://github.com/MetaMask/core/pull/0000))
- Add `disconnectX` method to `ProfileService` for sending an authenticated `DELETE` request to the `profiles/{profileId}/x` endpoint ([#0000](https://github.com/MetaMask/core/pull/0000))

### Changed

- `ProfileController.startXConnect` takes an optional params object and forwards an optional CAIP-10 `linkedAddress` to the backend; the profile is resolved server-side from the verified bearer token ([#0000](https://github.com/MetaMask/core/pull/0000))
- **BREAKING**: `ProfileController.connectX` now takes `{ code, state, profileId }`, always fetches the profile from the backend after the connect (the backend auto-creates the profile during X connect when missing), persists both `profile` and `xProfile` in state, and returns `{ profile, xProfile, profileCreated }` instead of just the X profile ([#0000](https://github.com/MetaMask/core/pull/0000))
- `ProfileService.connectX` response now includes the optional `profile_created` boolean reported by the backend (optional so older backends without the field still validate) ([#0000](https://github.com/MetaMask/core/pull/0000))
- `ProfileService.getXAuthUrl` now accepts an optional CAIP-10 `linkedAddress` parameter, sent as the `linked_address` query parameter (required by the backend when the profile does not exist yet) ([#0000](https://github.com/MetaMask/core/pull/0000))
- `ProfileController.connectX` persists `xProfile` in state immediately after a successful connect; if the follow-up profile fetch fails, the X link stays persisted and a clear error is thrown ([#0000](https://github.com/MetaMask/core/pull/0000))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/profile-controller@1.0.1...HEAD
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/profile-controller@1.0.0...@metamask/profile-controller@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/profile-controller@1.0.0
