# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release of `KycController` and `KycService`, a shared, platform-agnostic KYC / identity-verification controller used across MetaMask clients
  - `KycController` (`BaseController`) owns the flow state machine, the Check/Auth frame message protocol, X25519 credential decryption, and SumSub orchestration via an injected `KycSumSubLauncher` adapter.
  - `KycService` performs the Universal KYC (UKYC) HTTP calls via an injected `fetch`, sourcing the auth bearer token and geolocation through the messenger.
  - Exposes a vendor-neutral, per-product surface (`ramps`, `card`) plus reselect selectors.
- Add automatic post-authentication continuation to `KycController`
  - `initialize` and `acceptTermsAndStartSession` now accept an optional `product` (`ramps` | `card`), tracked in new `activeProduct` state.
  - When a `product` is set, reaching the `form` phase automatically runs the KYC-required check and, when KYC is required, launches the SumSub document-verification sub-flow — no extra `checkKycRequired` / `startSumSub` calls needed. When no `product` is set, the flow stops at `form` for the consumer to drive manually (unchanged behavior).
- Add optional `baseUrl` option to `KycService` constructor that overrides the base URL derived from `env`, enabling clients to target a custom (e.g. local or staging) KYC API

[Unreleased]: https://github.com/MetaMask/core/
