# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release ([#0000](https://github.com/MetaMask/core/pull/0000))
  - Add `MoneyAccountLifecycleController` and `getDefaultMoneyAccountLifecycleControllerState`
  - Add `init` method, also exposed through the messenger as `MoneyAccountLifecycleController:init`
    - Fetches derived identities from CHOMP while the client's `isEnabled` hook returns `true` and the wallet is unlocked with an HD keyring, refetching on unlock and when the remote feature flag values change
  - Add `derivedIdentities` getter, which returns the most recently fetched derived identities
  - Add `MoneyAccountLifecycleControllerActions`, `MoneyAccountLifecycleControllerEvents`, `MoneyAccountLifecycleControllerGetStateAction`, `MoneyAccountLifecycleControllerHooks`, `MoneyAccountLifecycleControllerInitAction`, `MoneyAccountLifecycleControllerMessenger`, `MoneyAccountLifecycleControllerState`, and `MoneyAccountLifecycleControllerStateChangedEvent` types

[Unreleased]: https://github.com/MetaMask/core/
