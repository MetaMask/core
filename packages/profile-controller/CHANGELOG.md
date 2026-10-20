# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.1]

### Changed

- Bump `@metamask/base-controller` from `^10.0.0` to `^10.1.0` ([#10864](https://github.com/MetaMask/core/pull/10864))
- Bump `@metamask/profile-sync-controller` from `^34.0.3` to `^35.0.0` ([#10905](https://github.com/MetaMask/core/pull/10905), [#10925](https://github.com/MetaMask/core/pull/10925))

## [1.1.0]

### Added

- Add `ProfileServiceMock` for mocking profile-api responses ([#10745](https://github.com/MetaMask/core/pull/10745))
- Add `getXAuthorizationUrl` method to `ProfileController` for initiating the X OAuth flow. It fetches the authorization URL via `ProfileService:getXAuthUrl` (the profile is resolved server-side from the verified bearer token), and returns the authorization URL and state parameter as ephemeral session data, without storing them in controller state ([#10668](https://github.com/MetaMask/core/pull/10668), [#10793](https://github.com/MetaMask/core/pull/10793))
- Add `disconnectX` method to `ProfileController` for unlinking the X account from a profile. It delegates to `ProfileService:disconnectX`, and when the disconnected profile matches the profile in state, clears `xProfile` from controller state and sets `connectedToX` to `false` ([#10668](https://github.com/MetaMask/core/pull/10668))
- Add `disconnectX` method to `ProfileService` for sending an authenticated `DELETE` request to the `profiles/{profileId}/x` endpoint; a `404` response is treated as success (the X account is already disconnected) ([#10668](https://github.com/MetaMask/core/pull/10668))
- Add `fetchAndUpdateProfile` method to the `ProfileController` to fetch a profile from the profile-api and update the controller's state ([#10793](https://github.com/MetaMask/core/pull/10793))

### Changed

- `getXAuthorizationUrl` no longer accepts a `linkedAddress` parameter ([#10668](https://github.com/MetaMask/core/pull/10668))
- `connectX` updates controller state (`xProfile`) on success ([#10668](https://github.com/MetaMask/core/pull/10668), [#10793](https://github.com/MetaMask/core/pull/10793))
- Bump `@metamask/profile-sync-controller` from `^34.0.0` to `^34.0.3` ([#10752](https://github.com/MetaMask/core/pull/10752), [#10756](https://github.com/MetaMask/core/pull/10756), [#10761](https://github.com/MetaMask/core/pull/10761))

### Fixed

- Fix the `ProfileController` messenger event type: the controller exposes `ProfileController:stateChanged` (emitted on state changes), not `ProfileController:stateChange` ([#10668](https://github.com/MetaMask/core/pull/10668))
- Fix the `ProfileService`'s response type to not have `avatar_url` as nullable ([#10793](https://github.com/MetaMask/core/pull/10793))

## [1.0.1]

### Changed

- Bump `@metamask/profile-sync-controller` from `^33.0.0` to `^34.0.0` ([#10662](https://github.com/MetaMask/core/pull/10662))

## [1.0.0]

### Added

- Add `ProfileController` for managing user profile state, exposing `getMetaMaskProfile`, `getXprofile`, `createProfile`, `replaceProfile`, `updateProfile`, `deleteProfile`, `checkUsernameAvailability`, `getXAuthUrl`, `connectX`, and `getXAccount` via the messenger ([#10558](https://github.com/MetaMask/core/pull/10558))
- Add `ProfileService` for communicating with the MetaMask Profile API, exposing `getProfile`, `createProfile`, `replaceProfile`, `updateProfile`, `deleteProfile`, `checkUsernameAvailability`, `getXAuthUrl`, `connectX`, and `getXAccount` via the messenger, with superstruct validation on all inputs and responses ([#10558](https://github.com/MetaMask/core/pull/10558))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/profile-controller@1.1.1...HEAD
[1.1.1]: https://github.com/MetaMask/core/compare/@metamask/profile-controller@1.1.0...@metamask/profile-controller@1.1.1
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/profile-controller@1.0.1...@metamask/profile-controller@1.1.0
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/profile-controller@1.0.0...@metamask/profile-controller@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/profile-controller@1.0.0
