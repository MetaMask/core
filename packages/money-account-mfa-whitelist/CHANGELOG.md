# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add support for Node.js 26 ([#10981](https://github.com/MetaMask/core/pull/10981))

### Changed

- Bump `@metamask/delegation-deployments` from `^1.4.0` to `^2.1.0`

## [0.1.0]

### Added

- Initial release ([#10841](https://github.com/MetaMask/core/pull/10841))
  - Add `getMfaRequirement`, which determines whether a hash can be signed with a Money Account's key without MFA approval, given the signature request it was computed from
  - A whitelisted request must be for the signing account and hash to exactly the given hash (EIP-191, EIP-712 or EIP-7702), so the signer can sign the hash after inspecting the request
  - Whitelist the CHOMP authentication, Rewards binding and Card sign-in messages, the EIP-7702 authorization to `EIP7702StatelessDeleGatorImpl`, standing vault delegations to the CHOMP delegate, and single-use vault deposit delegations

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/money-account-mfa-whitelist@0.1.0...HEAD
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/money-account-mfa-whitelist@0.1.0
