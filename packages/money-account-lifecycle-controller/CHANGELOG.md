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
  - Record whether the primary Money Account is `unregistered`, a valid `sfa`, or a valid `mfa` in the persisted `moneyAccounts` state, keyed by lowercased Money Account address
    - The status is derived by comparing the Money Account address against the current and previous addresses of the fetched derived identities, and is re-evaluated after each fetch and whenever `MoneyAccountController` state changes
  - Add `MoneyAccountLifecycleController:mfaDetected` event, published with the Money Account address and its successor `currentAddress` when the Money Account becomes a valid MFA
  - Add `MoneyAccountLifecycleControllerActions`, `MoneyAccountLifecycleControllerEvents`, `MoneyAccountLifecycleControllerGetStateAction`, `MoneyAccountLifecycleControllerHooks`, `MoneyAccountLifecycleControllerInitAction`, `MoneyAccountLifecycleControllerMessenger`, `MoneyAccountLifecycleControllerMfaDetectedEvent`, `MoneyAccountLifecycleControllerState`, `MoneyAccountLifecycleControllerStateChangedEvent`, and `MoneyAccountLifecycleStatus` types

[Unreleased]: https://github.com/MetaMask/core/
