# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release ([#10627](https://github.com/MetaMask/core/pull/10627))
  - Add `MoneyAccountLifecycleController` and `getDefaultMoneyAccountLifecycleControllerState`
  - Add `init` method, also exposed through the messenger as `MoneyAccountLifecycleController:init`
    - Fetches derived identities from CHOMP while the client's `isEnabled` hook returns `true` and the wallet is unlocked with an HD keyring, refetching on unlock and when the remote feature flag values change
  - Add `getMoneyAccountIdentity` method, also exposed through the messenger as `MoneyAccountLifecycleController:getMoneyAccountIdentity`
    - Returns the `currentAddress`, `previousAddresses`, and `status` of the primary Money Account's recorded identity, for reading balances across every address in its chain
    - Returns the lowercased Money Account address as the `currentAddress`, with no `previousAddresses` and status `NONE`, when the Money Account is `notInIdentity` (not yet registered with CHOMP)
    - Returns `undefined` when there is no Money Account or no lifecycle has been recorded for it
  - Add `startMigration` method, also exposed through the messenger as `MoneyAccountLifecycleController:startMigration`, as a stub for migrating the primary Money Account from its SFA address to a new MFA address
    - Throws unless the feature is enabled, the wallet is unlocked with an HD keyring, and there is a Money Account
    - Reads the profile's derived identities fresh from CHOMP and records them, then throws when any identity is `MIGRATING` or the Money Account is not a valid `sfa`
    - Creates the MFA account through `MfaMigrationController:createMfaAccount`, then throws when its address is already part of an identity or has CHOMP intents
    - Linking the MFA address and completing the migration are not implemented yet, so it throws once these checks pass
    - Rejects a call made while another is in flight
  - Record the primary Money Account's lifecycle in the persisted `moneyAccounts` state, keyed by lowercased Money Account address
    - The lifecycle is `notInIdentity` when the Money Account address is not among any derived identity's current or previous addresses, a valid `sfa` when it is the current address of a settled derived identity, `migrating` when it is the current address of a derived identity with a pending `migration` to a successor, or a valid `mfa` when it is a previous address of a derived identity, including one that is migrating to a further address
    - `sfa`, `migrating`, and `mfa` lifecycles include the matching derived identity's `currentAddress`, `previousAddresses`, `status`, and `migration`
    - The lifecycle is re-evaluated after each fetch and whenever `MoneyAccountController` state changes
  - Record whether the Money Account address, and the successor `currentAddress` of a valid MFA, are registered with CHOMP in the persisted `addressRegistrations` state, keyed by lowercased address, using `MoneyAccountUpgradeController:getRegistrationStatus`
    - The registration status is refreshed after each fetch and whenever the recorded lifecycle changes
  - Register the Money Account address through `MoneyAccountUpgradeController:upgradeAccount` when it is not registered with CHOMP and is either `notInIdentity` or a valid `sfa`, then refresh its registration status
    - A `migrating` Money Account is never registered, because CHOMP freezes it once it is linked to a successor
    - Failed registrations are reported through the messenger's `captureException` and retried on the next fetch
  - Call `MoneyAccountController:useMpcKeyring` with the Money Account address and its successor `currentAddress` when the Money Account is a valid MFA, after each fetch and whenever the recorded lifecycle changes
  - Add `AddressRegistration`, `MoneyAccountIdentity`, `MoneyAccountLifecycle`, `MoneyAccountLifecycleControllerActions`, `MoneyAccountLifecycleControllerEvents`, `MoneyAccountLifecycleControllerGetMoneyAccountIdentityAction`, `MoneyAccountLifecycleControllerGetStateAction`, `MoneyAccountLifecycleControllerHooks`, `MoneyAccountLifecycleControllerInitAction`, `MoneyAccountLifecycleControllerMessenger`, `MoneyAccountLifecycleControllerStartMigrationAction`, `MoneyAccountLifecycleControllerState`, and `MoneyAccountLifecycleControllerStateChangedEvent` types

[Unreleased]: https://github.com/MetaMask/core/
