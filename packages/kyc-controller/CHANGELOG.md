# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `KycController.getCustomerIdentity()` method and the `KycController:getCustomerIdentity` messenger action (plus the exported `KycControllerGetCustomerIdentityAction` and `KycCustomerIdentity` types). Returns the vendor-scoped `{ vendor, id }` for the currently authenticated customer, or `null` before authentication and after `reset()`. Lets consumers (e.g. ramps autoramp creation) attach the vendor customer id to downstream calls without reading the full KYC state, which also holds session/access tokens. The id is session-scoped and never persisted. ([#9853](https://github.com/MetaMask/core/pull/9853))
- Add Iron (Money/VBA) KYC path to `@metamask/kyc-controller`: `vendor: 'iron'` skips MoonPay Check/Auth frames; `KycService` clients for `/vendors/iron/*`, `POST /consents`, and `GET /kyc/status`; `refreshKycStatus` + `statusChanged` for Money toast state ([#9852](https://github.com/MetaMask/core/pull/9852), [#9853](https://github.com/MetaMask/core/pull/9853))
- Initial release of the `@metamask/kyc-controller` package for managing KYC / identity verification state across MetaMask clients ([#9781](https://github.com/MetaMask/core/pull/9781), [#9853](https://github.com/MetaMask/core/pull/9853))
- Add `KycController` and `KycService` for managing KYC / identity verification state across MetaMask clients ([#9615](https://github.com/MetaMask/core/pull/9615), [#9853](https://github.com/MetaMask/core/pull/9853))
  - `KycController` (`BaseController`) owns the flow state machine, the Check/Auth frame message protocol, X25519 credential decryption, and SumSub orchestration via an injected `KycSumSubLauncher` adapter.
  - `KycService` extends `BaseDataService` and performs the Universal KYC (UKYC) HTTP calls via an injected `fetch`, sourcing the auth bearer token and geolocation through the messenger.
  - Exposes a vendor-neutral, per-product surface (`ramps`, `card`) plus reselect selectors.
  - Add automatic post-authentication continuation to `KycController`
  - Add optional `baseUrl` option to `KycService` constructor that overrides the base URL derived from `env`, enabling clients to target a custom (e.g. local or staging) KYC API
  - Add UKYC session-status polling to `KycController`
  - Add handling in `KycController.startSumSub` for applicants already being processed by the vendor

### Removed

- Move Money Account wallet registration to `@metamask/ramps-controller`: removes `KycController.registerMoneyAccountWallet`, the `KycService` wallet-registration methods (`getMoonpayCustomerId`, `getWalletRegistrationStatus`, `registerSelfHostedWallet`), the `neobankBaseUrl` service option, and the wallet registration exports (`WalletRegistrationError`, `SelfHostedRegistration`, `MoneyAccountWalletRegistrationResult`, and related types). Wallet ownership signing is a Money Movement (neobank-proxy) concern, so it now lives on `RampsController` / `NeoBankService`. ([#9853](https://github.com/MetaMask/core/pull/9853))

[Unreleased]: https://github.com/MetaMask/core/
