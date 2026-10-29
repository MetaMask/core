# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- Release 1372.0.0 ([#11154](https://github.com/MetaMask/core/pull/11154))
- test: run earn packages on Vitest ([#10962](https://github.com/MetaMask/core/pull/10962))
- chore: opt into Jest types per package instead of in tsconfig.base.json ([#10862](https://github.com/MetaMask/core/pull/10862))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/money-account-mfa-whitelist@0.1.0...HEAD
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/money-account-mfa-whitelist@0.1.0
