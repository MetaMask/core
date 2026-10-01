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
  - Record the primary Money Account's lifecycle in the persisted `moneyAccounts` state, keyed by lowercased Money Account address
    - The lifecycle is `notInIdentity` when the Money Account address is not among any derived identity's current or previous addresses, a valid `sfa` when it is the current address of a derived identity, or a valid `mfa` when it is a previous address of a derived identity, including one that is migrating to a further address
    - `sfa` and `mfa` lifecycles include the matching derived identity's `currentAddress`, `previousAddresses`, `status`, and `migration`
    - The lifecycle is re-evaluated after each fetch and whenever `MoneyAccountController` state changes
  - Record whether the Money Account address, and the successor `currentAddress` of a valid MFA, are registered with CHOMP in the persisted `addressRegistrations` state, keyed by lowercased address, using `MoneyAccountUpgradeController:getRegistrationStatus`
    - The registration status is refreshed after each fetch and whenever the recorded lifecycle changes
  - Register the Money Account address through `MoneyAccountUpgradeController:upgradeAccount` when it is not registered with CHOMP and is not a valid MFA, then refresh its registration status
    - Failed registrations are reported through the messenger's `captureException` and retried on the next fetch
  - Call `MoneyAccountController:useMpcKeyring` with the Money Account address and its successor `currentAddress` when the Money Account is a valid MFA, after each fetch and whenever the recorded lifecycle changes
  - Add `AddressRegistration`, `MoneyAccountLifecycle`, `MoneyAccountLifecycleControllerActions`, `MoneyAccountLifecycleControllerEvents`, `MoneyAccountLifecycleControllerGetStateAction`, `MoneyAccountLifecycleControllerHooks`, `MoneyAccountLifecycleControllerInitAction`, `MoneyAccountLifecycleControllerMessenger`, `MoneyAccountLifecycleControllerState`, and `MoneyAccountLifecycleControllerStateChangedEvent` types

[Unreleased]: https://github.com/MetaMask/core/
