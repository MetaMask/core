# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Bump `@metamask/profile-sync-controller` from `^34.0.0` to `^34.0.3` ([#10752](https://github.com/MetaMask/core/pull/10752), [#10756](https://github.com/MetaMask/core/pull/10756), [#10761](https://github.com/MetaMask/core/pull/10761))

## [1.0.1]

### Changed

- Bump `@metamask/profile-sync-controller` from `^33.0.0` to `^34.0.0` ([#10662](https://github.com/MetaMask/core/pull/10662))

## [1.0.0]

### Added

- Add `ProfileController` for managing user profile state, exposing `getMetaMaskProfile`, `getXprofile`, `createProfile`, `replaceProfile`, `updateProfile`, `deleteProfile`, `checkUsernameAvailability`, `getXAuthUrl`, `connectX`, and `getXAccount` via the messenger ([#10558](https://github.com/MetaMask/core/pull/10558))
- Add `ProfileService` for communicating with the MetaMask Profile API, exposing `getProfile`, `createProfile`, `replaceProfile`, `updateProfile`, `deleteProfile`, `checkUsernameAvailability`, `getXAuthUrl`, `connectX`, and `getXAccount` via the messenger, with superstruct validation on all inputs and responses ([#10558](https://github.com/MetaMask/core/pull/10558))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/profile-controller@1.0.1...HEAD
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/profile-controller@1.0.0...@metamask/profile-controller@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/profile-controller@1.0.0
