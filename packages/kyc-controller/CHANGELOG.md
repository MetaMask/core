# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release of the `@metamask/kyc-controller` package: a platform-agnostic controller and data service for orchestrating KYC / identity verification across MetaMask clients ([#9615](https://github.com/MetaMask/core/pull/9615), [#9712](https://github.com/MetaMask/core/pull/9712))
  - `KycController` owns the end-to-end flow: the KYC state machine, the MoonPay Check/Auth hosted-frame message protocol, X25519 credential decryption, and SumSub orchestration through an injected `KycSumSubLauncher` adapter (keeping the controller SDK-free). It performs the authenticated Universal KYC (UKYC) HTTP calls (disclaimers, sessions, kyc-required, wrapping-key, JWKS, UKYC session/journey/status polling) with `superstruct` response validation and `createServicePolicy` resilience, sourcing the bearer token and geolocation through the messenger.
  - Passing an optional `product` (`ramps` or `card`) makes the controller automatically run the KYC-required check and chain into the SumSub sub-flow after authentication, with generation/phase guards so `reset()` and stale frame messages cannot corrupt state.

### Changed

- Bump `@metamask/profile-sync-controller` from `^29.0.0` to `^30.0.0` ([#9936](https://github.com/MetaMask/core/pull/9936))

[Unreleased]: https://github.com/MetaMask/core/
