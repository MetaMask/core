# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `KycController.getCustomerIdentity()` method and the `KycController:getCustomerIdentity` messenger action (plus the exported `KycControllerGetCustomerIdentityAction` and `KycCustomerIdentity` types). Returns the vendor-scoped `{ vendor, id }` for the currently authenticated customer, or `null` before authentication and after `reset()`. Lets consumers (e.g. ramps autoramp creation) attach the vendor customer id to downstream calls without reading the full KYC state, which also holds session/access tokens. The id is session-scoped and never persisted.
- Add Iron (Money/VBA) KYC path to `@metamask/kyc-controller`: `vendor: 'iron'` skips MoonPay Check/Auth frames; `KycService` clients for `/vendors/iron/*`, `POST /consents`, and `GET /kyc/status`; `refreshKycStatus` + `statusChanged` for Money toast state
- Initial release of the `@metamask/kyc-controller` package for managing KYC / identity verification state across MetaMask clients ([#9781](https://github.com/MetaMask/core/pull/9781))
- Add `KycController` and `KycService` for managing KYC / identity verification state across MetaMask clients ([#9615](https://github.com/MetaMask/core/pull/9615))
  - `KycController` (`BaseController`) owns the flow state machine, the Check/Auth frame message protocol, X25519 credential decryption, and SumSub orchestration via an injected `KycSumSubLauncher` adapter.
  - `KycService` extends `BaseDataService` and performs the Universal KYC (UKYC) HTTP calls via an injected `fetch`, sourcing the auth bearer token and geolocation through the messenger.
  - Exposes a vendor-neutral, per-product surface (`ramps`, `card`) plus reselect selectors.
  - Add automatic post-authentication continuation to `KycController`
  - Add optional `baseUrl` option to `KycService` constructor that overrides the base URL derived from `env`, enabling clients to target a custom (e.g. local or staging) KYC API
  - Add UKYC session-status polling to `KycController`
  - Add handling in `KycController.startSumSub` for applicants already being processed by the vendor

[Unreleased]: https://github.com/MetaMask/core/
