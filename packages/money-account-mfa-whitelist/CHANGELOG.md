# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Whitelist MetaMask Rewards mUSD claims from the Money Account ([#11731](https://github.com/MetaMask/core/pull/11731))
  - Add the `rewards-claim-delegation` rule: a single-use delegation whose exact executions are `mUSD.receiveWithAuthorization` to the Money Account, followed by a vault deposit of the same amount
  - Add the `rewards-claim-proof` rule: the Rewards claim proof message when its earning address and payout address are the Money Account and it expires within `maxMessageAge` plus one minute

### Changed

- Bump `@metamask/utils` from `^12.0.2` to `^12.1.0` ([#11796](https://github.com/MetaMask/core/pull/11796))

## [0.3.0]

### Added

- Whitelist CHOMP's successor association message for `chompSignInDomain`, so migrating to the MPC Money Account no longer asks for MFA ([#11310](https://github.com/MetaMask/core/pull/11310))

### Changed

- Bump `@metamask/abi-utils` from `^2.0.4` to `^3.0.0` ([#11356](https://github.com/MetaMask/core/pull/11356))
- Bump `@metamask/utils` from `^12.0.1` to `^12.0.2` ([#11474](https://github.com/MetaMask/core/pull/11474))

### Fixed

- Whitelist single-use vault deposit delegations that carry a `Redeemer` caveat ([#11310](https://github.com/MetaMask/core/pull/11310))

## [0.2.0]

### Added

- Add support for Node.js 26 ([#10981](https://github.com/MetaMask/core/pull/10981))

### Changed

- **BREAKING:** `DelegationFrameworkContracts` requires `TimestampEnforcer` ([#11185](https://github.com/MetaMask/core/pull/11185))
- Bump `@metamask/utils` from `^12.0.0` to `^12.0.1` ([#11107](https://github.com/MetaMask/core/pull/11107))

### Fixed

- Whitelist single-use vault deposit delegations that carry a `Timestamp` deadline caveat ([#11185](https://github.com/MetaMask/core/pull/11185))

## [0.1.0]

### Added

- Initial release ([#10841](https://github.com/MetaMask/core/pull/10841))
  - Add `getMfaRequirement`, which determines whether a hash can be signed with a Money Account's key without MFA approval, given the signature request it was computed from
  - A whitelisted request must be for the signing account and hash to exactly the given hash (EIP-191, EIP-712 or EIP-7702), so the signer can sign the hash after inspecting the request
  - Whitelist the CHOMP authentication, Rewards binding and Card sign-in messages, the EIP-7702 authorization to `EIP7702StatelessDeleGatorImpl`, standing vault delegations to the CHOMP delegate, and single-use vault deposit delegations

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/money-account-mfa-whitelist@0.3.0...HEAD
[0.3.0]: https://github.com/MetaMask/core/compare/@metamask/money-account-mfa-whitelist@0.2.0...@metamask/money-account-mfa-whitelist@0.3.0
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/money-account-mfa-whitelist@0.1.0...@metamask/money-account-mfa-whitelist@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/money-account-mfa-whitelist@0.1.0
