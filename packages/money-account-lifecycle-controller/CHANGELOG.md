# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release ([#10699](https://github.com/MetaMask/core/pull/10699))
  - Add `MoneyAccountLifecycleController` and `getDefaultMoneyAccountLifecycleControllerState`
  - Add `init` method, also exposed through the messenger as `MoneyAccountLifecycleController:init`
    - Fetches derived identities from CHOMP while the client's `isEnabled` hook returns `true` and the wallet is unlocked with an HD keyring, refetching on unlock and when the remote feature flag values change
  - Add `getMoneyAccountIdentity` method, also exposed through the messenger as `MoneyAccountLifecycleController:getMoneyAccountIdentity`
    - Returns the `currentAddress`, `previousAddresses`, and `status` of the primary Money Account's recorded identity, for reading balances across every address in its chain
    - Returns the lowercased Money Account address as the `currentAddress`, with no `previousAddresses` and status `NONE`, when the Money Account is `notInIdentity` (not yet registered with CHOMP)
    - Returns `undefined` when there is no Money Account or no lifecycle has been recorded for it
  - Record the primary Money Account's lifecycle in the persisted `moneyAccounts` state, keyed by lowercased Money Account address
    - The lifecycle is `notInIdentity` when the Money Account address is not among any derived identity's current or previous addresses, a valid `sfa` when it is the current address of a settled derived identity, `migrating` when it is the current address of a derived identity with a pending `migration` to a successor, or a valid `mfa` when it is a previous address of a derived identity, including one that is migrating to a further address
    - `sfa`, `migrating`, and `mfa` lifecycles include the matching derived identity's `currentAddress`, `previousAddresses`, `status`, and `migration`
    - The lifecycle is re-evaluated after each fetch and whenever `MoneyAccountController` state changes
  - Record whether the Money Account address, and the successor `currentAddress` of a valid MFA, are registered with CHOMP in the persisted `addressRegistrations` state, keyed by lowercased address, using `MoneyAccountUpgradeController:getRegistrationStatus`
    - The registration status is refreshed after each fetch and whenever the recorded lifecycle changes
  - Add `upgradeMoneyAccount` method, also exposed through the messenger as `MoneyAccountLifecycleController:upgradeMoneyAccount`
    - Makes one attempt to upgrade the primary Money Account through `MoneyAccountUpgradeController:upgradeAccount`, then refreshes its recorded registration status; clients decide when to call it and how to retry
    - Uses the recorded lifecycle, fetching derived identities fresh from CHOMP when none has been recorded
    - Only upgrades a Money Account that is `notInIdentity` or a valid `sfa`, and otherwise resolves without upgrading, as it does when the feature is unavailable or there is no Money Account
    - Rejects with the error from fetching identities or from the upgrade, unchanged
    - Concurrent calls share the attempt in flight
  - Call `MoneyAccountController:setDefaultMoneyAccount` with the MPC money account when the Money Account is a valid MFA, after each fetch and whenever `MoneyAccountController` state changes
    - Only applies once the MPC money account exists and its address is the identity's successor `currentAddress`; the lifecycle controller never creates it
  - Add `AddressRegistration`, `MoneyAccountIdentity`, `MoneyAccountLifecycle`, `MoneyAccountLifecycleControllerActions`, `MoneyAccountLifecycleControllerEvents`, `MoneyAccountLifecycleControllerGetMoneyAccountIdentityAction`, `MoneyAccountLifecycleControllerGetStateAction`, `MoneyAccountLifecycleControllerHooks`, `MoneyAccountLifecycleControllerInitAction`, `MoneyAccountLifecycleControllerMessenger`, `MoneyAccountLifecycleControllerState`, `MoneyAccountLifecycleControllerStateChangedEvent`, and `MoneyAccountLifecycleControllerUpgradeMoneyAccountAction` types

[Unreleased]: https://github.com/MetaMask/core/
