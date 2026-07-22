# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add optional `baseUrl` option to `KycService` constructor that overrides the base URL derived from `env`, enabling clients to target a custom (e.g. local or staging) KYC API ([#0000](https://github.com/MetaMask/core/pull/0000))
- Initial release of `KycController` and `KycService`, a shared, platform-agnostic KYC / identity-verification controller used across MetaMask clients ([#0000](https://github.com/MetaMask/core/pull/0000))
  - `KycController` (`BaseController`) owns the flow state machine, the Check/Auth frame message protocol, X25519 credential decryption, and SumSub orchestration via an injected `KycSumSubLauncher` adapter.
  - `KycService` performs the Universal KYC (UKYC) HTTP calls via an injected `fetch`, sourcing the auth bearer token and geolocation through the messenger.
  - Exposes a vendor-neutral, per-product surface (`ramps`, `card`) plus reselect selectors.

[Unreleased]: https://github.com/MetaMask/core/
