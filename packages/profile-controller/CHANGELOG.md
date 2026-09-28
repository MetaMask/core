# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `ProfileController` for managing user profile state, exposing `getMetaMaskProfile`, `getXprofile`, `createProfile`, `replaceProfile`, `updateProfile`, `deleteProfile`, `checkUsernameAvailability`, `getXAuthUrl`, `connectX`, and `getXAccount` via the messenger
- Add `ProfileService` for communicating with the MetaMask Profile API, exposing `getProfile`, `createProfile`, `replaceProfile`, `updateProfile`, `deleteProfile`, `checkUsernameAvailability`, `getXAuthUrl`, `connectX`, and `getXAccount` via the messenger, with superstruct validation on all inputs and responses
- Add `useGetProfile` and `useCheckUsernameAvailability` React query hooks for reading profile data in UI components via `@metamask/react-data-query`

[Unreleased]: https://github.com/MetaMask/core/
