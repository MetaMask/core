# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add persisted state tracking fully upgraded accounts ([#9500](https://github.com/MetaMask/core/pull/9500))
  - `MoneyAccountUpgradeControllerState` now contains `upgradedAccounts`, keyed by lowercased account address. Each entry records when the upgrade sequence completed and a fingerprint of the config it completed under (see new `MoneyAccountUpgradeStatus` type).
  - The constructor now accepts an optional `state` option, merged with the defaults; add `getDefaultMoneyAccountUpgradeControllerState` to construct those defaults.
- Add `upgradeAccountWithRetry` method and matching `MoneyAccountUpgradeController:upgradeAccountWithRetry` messenger action ([#9500](https://github.com/MetaMask/core/pull/9500))
  - Retries failed `upgradeAccount` attempts with capped exponential backoff (10s, 20s, 40s, then 60s between attempts; 5 attempts by default). Terminal failures and non-step errors are rethrown without retrying. Accepts an `AbortSignal` to cancel waiting between attempts.
- Add `TerminalUpgradeError` and `isTerminalMoneyAccountUpgradeError`, and a `terminal` property on `MoneyAccountUpgradeStepError`, marking failures that cannot resolve by retrying — currently an account delegated to a third-party EIP-7702 implementation, an account with unexpected on-chain code, or an address confirmed to be associated with a different CHOMP profile ([#9500](https://github.com/MetaMask/core/pull/9500))

### Changed

- **BREAKING:** The `associate-address` upgrade step now checks the profile's existing address associations via `ChompApiService:getAssociatedAddresses` before signing, and reports `already-done` without signing or submitting anything when the address is already associated ([#9387](https://github.com/MetaMask/core/pull/9387))
  - `MoneyAccountUpgradeControllerMessenger` consumers must grant the `ChompApiService:getAssociatedAddresses` action alongside the previously required actions, and must provide a `@metamask/chomp-api-service` version that registers it (`>=4.0.0`).
  - The lookup is an optimization: if it fails, the step falls through to the previous sign-and-submit behavior.
  - A 409 conflict from the association request is disambiguated by re-fetching the associations, so a same-profile create race reports `already-done` instead of failing the upgrade; a genuine conflict (address associated with a different profile) still fails the step.
- `upgradeAccount` now skips the step sequence entirely when the account is recorded in state as upgraded under the active config fingerprint, and records the account after a successful run. If the chain, CHOMP contract addresses, or Delegation Framework version change, the fingerprint no longer matches and the sequence re-runs ([#9500](https://github.com/MetaMask/core/pull/9500))
- Bump `@metamask/messenger` from `^1.2.0` to `^2.0.0` ([#9392](https://github.com/MetaMask/core/pull/9392))
- Bump `@metamask/authenticated-user-storage` from `^3.0.0` to `^3.0.1` ([#9458](https://github.com/MetaMask/core/pull/9458))

## [2.2.1]

### Changed

- Bump `@metamask/network-controller` from `^33.0.0` to `^34.0.0` ([#9349](https://github.com/MetaMask/core/pull/9349))

## [2.2.0]

### Changed

- Bump `@metamask/authenticated-user-storage` from `^2.0.0` to `^3.0.0` ([#9220](https://github.com/MetaMask/core/pull/9220), [#9348](https://github.com/MetaMask/core/pull/9348))

## [2.1.0]

### Added

- Add `MoneyAccountUpgradeStepError` (and the `isMoneyAccountUpgradeStepError` type guard). `upgradeAccount` now wraps any error thrown by a step in this error, exposing the failing step's `name` as `step` and preserving the original error as `cause`, so consumers can attribute failures to a specific step when reporting to Sentry). ([#9204](https://github.com/MetaMask/core/pull/9204))

### Changed

- Bump `@metamask/keyring-controller` from `^27.0.0` to `^27.1.0` ([#9129](https://github.com/MetaMask/core/pull/9129))
- Bump `@metamask/network-controller` from `^32.0.0` to `^33.0.0` ([#9218](https://github.com/MetaMask/core/pull/9218))

## [2.0.5]

### Changed

- Bump `@metamask/utils` from `^11.9.0` to `^11.11.0` ([#9074](https://github.com/MetaMask/core/pull/9074))

### Fixed

- Scope the `register-intents` step to the currently-configured token addresses (deposit mUSD / withdrawal vmUSD) so that stale delegations for previously-configured tokens are no longer registered as intents ([#9075](https://github.com/MetaMask/core/pull/9075))

## [2.0.4]

### Changed

- Bump `@metamask/delegation-controller` from `^3.0.1` to `^3.0.2` ([#9058](https://github.com/MetaMask/core/pull/9058))
- Bump `@metamask/keyring-controller` from `^26.0.0` to `^27.0.0` ([#9058](https://github.com/MetaMask/core/pull/9058))

## [2.0.3]

### Changed

- Bump `@metamask/delegation-core` from `^2.0.0` to `^2.2.1` ([#8823](https://github.com/MetaMask/core/pull/8823))
- Bump `@metamask/delegation-deployments` from `^1.3.0` to `^1.4.0` ([#8823](https://github.com/MetaMask/core/pull/8823))
- Bump `@metamask/keyring-controller` from `^25.5.0` to `^26.0.0` ([#8912](https://github.com/MetaMask/core/pull/8912))
- Bump `@metamask/delegation-controller` from `^3.0.0` to `^3.0.1` ([#8912](https://github.com/MetaMask/core/pull/8912))

## [2.0.2]

### Changed

- Bump `@metamask/authenticated-user-storage` from `^1.0.1` to `^2.0.0` ([#8802](https://github.com/MetaMask/core/pull/8802))

## [2.0.1]

### Changed

- Bump `@metamask/network-controller` from `^31.1.0` to `^32.0.0` ([#8774](https://github.com/MetaMask/core/pull/8774))

## [2.0.0]

### Added

- Add remaining steps in money account upgrade process ([#8621](https://github.com/MetaMask/core/pull/8621))

### Changed

- **BREAKING:** The controller messenger now requires access to six additional allowed actions: `AuthenticatedUserStorageService:listDelegations`, `AuthenticatedUserStorageService:createDelegation`, `ChompApiService:verifyDelegation`, `ChompApiService:getIntentsByAddress`, `ChompApiService:createIntents`, and `DelegationController:signDelegation`. Delegation signing is now delegated to `@metamask/delegation-controller` rather than calling `KeyringController:signTypedMessage` directly; consumers must instantiate `DelegationController` and update their messenger configuration accordingly. ([#8621](https://github.com/MetaMask/core/pull/8621))
- **BREAKING:** `init()` now takes a `{ chainId, boringVaultAddress }` object instead of an `InitConfig`. The EIP-7702 delegator implementation and caveat enforcer addresses are resolved from `@metamask/delegation-deployments` for the target chain; `init()` throws if the chain is not supported by Delegation Framework 1.3.0. The `InitConfig` type is no longer exported. ([#8621](https://github.com/MetaMask/core/pull/8621))
- Add `@metamask/authenticated-user-storage`, `@metamask/delegation-controller`, `@metamask/delegation-core`, and `@metamask/delegation-deployments` as dependencies. ([#8621](https://github.com/MetaMask/core/pull/8621))
- Bump `@metamask/network-controller` from `^31.0.0` to `^31.1.0` ([#8765](https://github.com/MetaMask/core/pull/8765))
- Bump `@metamask/chomp-api-service` from `^3.0.1` to `^3.1.0` ([#8769](https://github.com/MetaMask/core/pull/8769))

### Fixed

- Build-delegation step no longer emits a redundant duplicate `ValueLteEnforcer` caveat; the Delegation Framework treats both as equivalent, but the duplicate was inadvertently inherited from `@metamask/smart-accounts-kit`'s `erc20TransferAmount` scope helper. ([#8621](https://github.com/MetaMask/core/pull/8621))
- EIP-7702 authorization step now treats a 409 response from `POST /v1/account-upgrade` as `already-done` instead of a fatal error, making the step retry-safe when a prior submission was accepted by CHOMP but has not yet been observed on-chain. ([#8621](https://github.com/MetaMask/core/pull/8621))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/money-account-upgrade-controller@2.2.1...HEAD
[2.2.1]: https://github.com/MetaMask/core/compare/@metamask/money-account-upgrade-controller@2.2.0...@metamask/money-account-upgrade-controller@2.2.1
[2.2.0]: https://github.com/MetaMask/core/compare/@metamask/money-account-upgrade-controller@2.1.0...@metamask/money-account-upgrade-controller@2.2.0
[2.1.0]: https://github.com/MetaMask/core/compare/@metamask/money-account-upgrade-controller@2.0.5...@metamask/money-account-upgrade-controller@2.1.0
[2.0.5]: https://github.com/MetaMask/core/compare/@metamask/money-account-upgrade-controller@2.0.4...@metamask/money-account-upgrade-controller@2.0.5
[2.0.4]: https://github.com/MetaMask/core/compare/@metamask/money-account-upgrade-controller@2.0.3...@metamask/money-account-upgrade-controller@2.0.4
[2.0.3]: https://github.com/MetaMask/core/compare/@metamask/money-account-upgrade-controller@2.0.2...@metamask/money-account-upgrade-controller@2.0.3
[2.0.2]: https://github.com/MetaMask/core/compare/@metamask/money-account-upgrade-controller@2.0.1...@metamask/money-account-upgrade-controller@2.0.2
[2.0.1]: https://github.com/MetaMask/core/compare/@metamask/money-account-upgrade-controller@2.0.0...@metamask/money-account-upgrade-controller@2.0.1
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/money-account-upgrade-controller@1.3.2...@metamask/money-account-upgrade-controller@2.0.0
[1.3.2]: https://github.com/MetaMask/core/compare/@metamask/money-account-upgrade-controller@1.3.1...@metamask/money-account-upgrade-controller@1.3.2
[1.3.1]: https://github.com/MetaMask/core/compare/@metamask/money-account-upgrade-controller@1.3.0...@metamask/money-account-upgrade-controller@1.3.1
[1.3.0]: https://github.com/MetaMask/core/compare/@metamask/money-account-upgrade-controller@1.2.0...@metamask/money-account-upgrade-controller@1.3.0
[1.2.0]: https://github.com/MetaMask/core/compare/@metamask/money-account-upgrade-controller@1.1.0...@metamask/money-account-upgrade-controller@1.2.0
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/money-account-upgrade-controller@1.0.0...@metamask/money-account-upgrade-controller@1.1.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/money-account-upgrade-controller@1.0.0
