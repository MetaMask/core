# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `build-delegation` step to the upgrade sequence ([#8621](https://github.com/MetaMask/core/pull/8621))
  - Builds two delegations per upgrade — one for deposits (mUSD) and one for withdrawals (vmUSD / Veda boring vault) — checking the storage service for an existing match per token before signing. The Veda boring vault address is supplied to `init()` by the consumer pending exposure via the CHOMP service-details API.
  - After CHOMP verification succeeds, each signed delegation is persisted via `AuthenticatedUserStorageService:createDelegation`. The metadata records the per-token symbol (`mUSD` / `vmUSD`), the `cash-deposit` / `cash-withdrawal` intent type, and a `delegationHash` derived from `@metamask/delegation-core`'s `hashDelegation`.
- Add `register-intents` step to the upgrade sequence ([#8621](https://github.com/MetaMask/core/pull/8621))
  - Submits one intent per stored delegation to `POST /v1/intent` so CHOMP can begin monitoring the account, idempotently skipping any delegation that already has an active intent (revoked intents are re-registered). After this step succeeds, CHOMP re-fetches the delegation from Authenticated User Storage, re-validates it, and adds the account to its monitoring list.

### Changed

- **BREAKING:** The controller messenger now requires access to six additional allowed actions: `AuthenticatedUserStorageService:listDelegations`, `AuthenticatedUserStorageService:createDelegation`, `ChompApiService:verifyDelegation`, `ChompApiService:getIntentsByAddress`, `ChompApiService:createIntents`, and `DelegationController:signDelegation`. Delegation signing is now delegated to `@metamask/delegation-controller` rather than calling `KeyringController:signTypedMessage` directly; consumers must instantiate `DelegationController` and update their messenger configuration accordingly. ([#8621](https://github.com/MetaMask/core/pull/8621))
- **BREAKING:** `init()` now takes a `{ chainId, boringVaultAddress }` object instead of an `InitConfig`. The EIP-7702 delegator implementation and caveat enforcer addresses are resolved from `@metamask/delegation-deployments` for the target chain; `init()` throws if the chain is not supported by Delegation Framework 1.3.0. The `InitConfig` type is no longer exported. ([#8621](https://github.com/MetaMask/core/pull/8621))
- **BREAKING:** `UpgradeConfig` no longer includes `musdTokenAddress` (now derived internally from the Veda protocol service details). ([#8621](https://github.com/MetaMask/core/pull/8621))
- Add `@metamask/authenticated-user-storage`, `@metamask/delegation-controller`, `@metamask/delegation-core`, and `@metamask/delegation-deployments` as dependencies. ([#8621](https://github.com/MetaMask/core/pull/8621))
- Bump `@metamask/network-controller` from `^31.0.0` to `^31.1.0` ([#8765](https://github.com/MetaMask/core/pull/8765))

### Fixed

- Build-delegation step no longer emits a redundant duplicate `ValueLteEnforcer` caveat; the Delegation Framework treats both as equivalent, but the duplicate was inadvertently inherited from `@metamask/smart-accounts-kit`'s `erc20TransferAmount` scope helper. ([#8621](https://github.com/MetaMask/core/pull/8621))

## [1.3.2]

### Changed

- Bump `@metamask/keyring-controller` from `^25.4.0` to `^25.5.0` ([#8722](https://github.com/MetaMask/core/pull/8722))
- Bump `@metamask/chomp-api-service` from `^3.0.0` to `^3.0.1` ([#8755](https://github.com/MetaMask/core/pull/8755))
- Bump `@metamask/network-controller` from `^30.1.0` to `^31.0.0` ([#8755](https://github.com/MetaMask/core/pull/8755))

## [1.3.1]

### Changed

- Bump `@metamask/keyring-controller` from `^25.3.0` to `^25.4.0` ([#8665](https://github.com/MetaMask/core/pull/8665))

### Fixed

- Fix the ChompApiService:createUpgrade call in the EIP-7702 auth step, pasing correct arguments ([#8657](https://github.com/MetaMask/core/pull/8657))

## [1.3.0]

### Changed

- Bump `@metamask/chomp-api-service` from `^2.0.0` to `^3.0.0` ([#8651](https://github.com/MetaMask/core/pull/8651))
- Bump `@metamask/messenger` from `^1.1.1` to `^1.2.0` ([#8632](https://github.com/MetaMask/core/pull/8632))
- Bump `@metamask/keyring-controller` from `^25.2.0` to `^25.3.0` ([#8634](https://github.com/MetaMask/core/pull/8634))
- Bump `@metamask/network-controller` from `^30.0.1` to `^30.1.0` ([#8636](https://github.com/MetaMask/core/pull/8636))

### Fixed

- Fix the associate-address step to detect the already-associated case via `status: 'active'`. ([#8635](https://github.com/MetaMask/core/pull/8635))

## [1.2.0]

### Changed

- Bump `@metamask/chomp-api-service` from `^1.0.0` to `^2.0.0` ([#8618](https://github.com/MetaMask/core/pull/8618))

### Fixed

- Send the CHOMP authentication timestamp as a number instead of a string in the associate-address step. ([#8610](https://github.com/MetaMask/core/pull/8610))

## [1.1.0]

### Added

- Add EIP-7702 authorization step to the upgrade sequence. ([#8565](https://github.com/MetaMask/core/pull/8565))

## [1.0.0]

### Added

- Add `MoneyAccountUpgradeController` with `upgradeAccount` method ([#8426](https://github.com/MetaMask/core/pull/8426))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/money-account-upgrade-controller@1.3.2...HEAD
[1.3.2]: https://github.com/MetaMask/core/compare/@metamask/money-account-upgrade-controller@1.3.1...@metamask/money-account-upgrade-controller@1.3.2
[1.3.1]: https://github.com/MetaMask/core/compare/@metamask/money-account-upgrade-controller@1.3.0...@metamask/money-account-upgrade-controller@1.3.1
[1.3.0]: https://github.com/MetaMask/core/compare/@metamask/money-account-upgrade-controller@1.2.0...@metamask/money-account-upgrade-controller@1.3.0
[1.2.0]: https://github.com/MetaMask/core/compare/@metamask/money-account-upgrade-controller@1.1.0...@metamask/money-account-upgrade-controller@1.2.0
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/money-account-upgrade-controller@1.0.0...@metamask/money-account-upgrade-controller@1.1.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/money-account-upgrade-controller@1.0.0
