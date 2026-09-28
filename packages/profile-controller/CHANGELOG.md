# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `ProfileController` for managing user profile state, exposing `getMetaMaskProfile`, `getXprofile`, `createProfile`, `updateProfile`, `deleteProfile`, and `checkUsernameAvailability` via the messenger
- Add `ProfileService` for communicating with the MetaMask Profile API, exposing `getProfile`, `createProfile`, `updateProfile`, `deleteProfile`, and `checkUsernameAvailability` via the messenger

[Unreleased]: https://github.com/MetaMask/core/
