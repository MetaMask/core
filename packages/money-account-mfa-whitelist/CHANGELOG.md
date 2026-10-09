# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release ([#10773](https://github.com/MetaMask/core/pull/10773))
  - Add `getMfaRequirement`, which determines whether a hash can be signed for the Money Account without MFA approval, given the signature request it was computed from
  - A whitelisted request must hash to exactly the given hash (EIP-191, EIP-712 or EIP-7702), so the signer can sign the hash after inspecting the request
  - Whitelist the CHOMP authentication, Rewards binding and Card sign-in messages, the EIP-7702 authorization to `EIP7702StatelessDeleGatorImpl`, standing vault delegations to the CHOMP delegate, and single-use vault deposit delegations

[Unreleased]: https://github.com/MetaMask/core/
