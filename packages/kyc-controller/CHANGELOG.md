# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Parameterize Universal KYC vendor HTTP on `KycService` so identity vendors share one client surface instead of vendor-branded methods ([#9908](https://github.com/MetaMask/core/pull/9908)):
  - `fetchDisclaimers({ vendor, country })` and `checkKycRequired({ vendor, ... })` call `/vendors/{vendor}/disclaimers` and `/vendors/{vendor}/kyc-required` (`vendor` defaults to `moonpay`)
  - `createVendorCustomer({ vendor, email })` calls `POST /vendors/{vendor}/customers`
  - `submitConsents({ disclaimerIds, ... })` posts `POST /consents` (wire body still uses `ironDisclaimerIds`)
  - `fetchKycStatus()` reads `GET /kyc/status`
- Add a consents-path KYC flow on `KycController` for non-MoonPay vendors (currently `iron`): empty-shell customer → disclaimers → consents → SumSub, skipping MoonPay Check/Auth frames. `initialize({ vendor })` and `createVendorCustomer({ vendor, email })` drive the path; `acceptTermsAndStartSession` requires `sumsubTncSigned` / `idosTncSigned`. ([#9908](https://github.com/MetaMask/core/pull/9908))
- Add `KycController.refreshKycStatus()` and the `KycController:statusChanged` event so consumers can poll user-keyed KYC status for toast / banner surfaces. ([#9908](https://github.com/MetaMask/core/pull/9908))
- Add `KycController.getCustomerIdentity()` (and `KycCustomerIdentity`) returning the vendor-scoped `{ vendor, id }` for the current session, or `null` before authentication and after `reset()`. ([#9908](https://github.com/MetaMask/core/pull/9908), [#9853](https://github.com/MetaMask/core/pull/9853))
- Extend `KycProduct` with `'money'` and `KycVendor` with `'iron'`. ([#9908](https://github.com/MetaMask/core/pull/9908))
- Add `KycUserStatus` / `KycUserStatusResponse` types for the simplified `GET /kyc/status` payload. ([#9908](https://github.com/MetaMask/core/pull/9908))
- Add persisted `termsAcceptedVendor` state recording which vendor's disclaimers `acceptedDisclaimerIds` belong to, so stored acceptance is only reused for that vendor. ([#9908](https://github.com/MetaMask/core/pull/9908))
- Add persisted `sumsubTncAccepted` and `idosTncAccepted` state so T&C2 flags can be validated when resuming a consents-path session. ([#9908](https://github.com/MetaMask/core/pull/9908))
- Initial release of the `@metamask/kyc-controller` package for managing KYC / identity verification state across MetaMask clients ([#9781](https://github.com/MetaMask/core/pull/9781), [#9615](https://github.com/MetaMask/core/pull/9615), [#9712](https://github.com/MetaMask/core/pull/9712), [#9853](https://github.com/MetaMask/core/pull/9853))
- Add `KycController` and `KycService` for managing KYC / identity verification state across MetaMask clients ([#9615](https://github.com/MetaMask/core/pull/9615), [#9712](https://github.com/MetaMask/core/pull/9712), [#9853](https://github.com/MetaMask/core/pull/9853))
  - `KycController` (`BaseController`) owns the flow state machine, the Check/Auth frame message protocol, X25519 credential decryption, and SumSub orchestration via an injected `KycSumSubLauncher` adapter.
  - `KycService` extends `BaseDataService` and performs the Universal KYC (UKYC) HTTP calls via an injected `fetch`, sourcing the auth bearer token and geolocation through the messenger.
  - Exposes a vendor-neutral, per-product surface (`ramps`, `card`) plus reselect selectors.
  - Add automatic post-authentication continuation to `KycController`
  - Add optional `baseUrl` option to `KycService` constructor that overrides the base URL derived from `env`, enabling clients to target a custom (e.g. local or staging) KYC API
  - Add UKYC session-status polling to `KycController`
  - Add handling in `KycController.startSumSub` for applicants already being processed by the vendor

### Changed

- Make the `fetch` option on the `KycService` constructor optional; it now defaults to the runtime's native `fetch` (browser, React Native, Node 18+), so consumers no longer need to inject one. ([#9908](https://github.com/MetaMask/core/pull/9908))
- **BREAKING:** Invalidate terms acceptance when `termsAcceptedVendor` is `null` (pre-migration state), forcing reacceptance after the multi-vendor upgrade to ensure users review current vendor terms. ([#9908](https://github.com/MetaMask/core/pull/9908))
- **BREAKING:** Require `sumsubTncSigned` and `idosTncSigned` on `acceptTermsAndStartSession` for every vendor, so callers explicitly declare T&C2 acceptance. Zero-argument calls and omitted flags fail instead of defaulting to `true`. ([#9908](https://github.com/MetaMask/core/pull/9908))
- Rename `CreateUkycSessionParams.vendorId` to `vendor` for consistency with other service methods. ([#9908](https://github.com/MetaMask/core/pull/9908))

### Removed

- Move Money Account wallet registration to `@metamask/ramps-controller`: removes `KycController.registerMoneyAccountWallet`, the `KycService` wallet-registration methods (`getMoonpayCustomerId`, `getWalletRegistrationStatus`, `registerSelfHostedWallet`), the `neobankBaseUrl` service option, and the wallet registration exports (`WalletRegistrationError`, `SelfHostedRegistration`, `MoneyAccountWalletRegistrationResult`, and related types). Wallet ownership signing is a Money Movement (neobank-proxy) concern, so it now lives on `RampsController` / `NeoBankService`. ([#9853](https://github.com/MetaMask/core/pull/9853))

### Fixed

- Clear `moonpayCustomerId` when the active vendor is not MoonPay, so `getCustomerIdentity()` cannot report a MoonPay customer id under another vendor. ([#9908](https://github.com/MetaMask/core/pull/9908), [#9861](https://github.com/MetaMask/core/pull/9861), [#9853](https://github.com/MetaMask/core/pull/9853))
- Call `unref()` on the user-status poll timer only when it exists. React Native and browser timers are numbers, so an unconditional `unref()` threw when status polling started outside Node. ([#9908](https://github.com/MetaMask/core/pull/9908), [#9861](https://github.com/MetaMask/core/pull/9861), [#9853](https://github.com/MetaMask/core/pull/9853))
- Skip the `session_not_in_valid_state` completion write when a `reset()` superseded the SumSub flow, so a late vendor response can no longer force `userStatus` to `completed` (and publish `statusChanged`) on an idle controller. ([#9908](https://github.com/MetaMask/core/pull/9908), [#9861](https://github.com/MetaMask/core/pull/9861), [#9853](https://github.com/MetaMask/core/pull/9853))
- Validate that `accessToken` and `country` are provided when calling `checkKycRequired` with vendor `moonpay`, failing fast with a clear error instead of posting `undefined` values to the API. ([#9908](https://github.com/MetaMask/core/pull/9908))
- Check for global `fetch` availability before binding in `KycService` constructor, throwing a descriptive error if `fetch` is neither provided nor globally available (e.g. older Node environments). ([#9908](https://github.com/MetaMask/core/pull/9908))
- Check for null bearer token before calling `assert()` in `#requestJson`, ensuring the custom "wallet signed in" error message is shown instead of a generic superstruct error. ([#9908](https://github.com/MetaMask/core/pull/9908))
- Require reacceptance of consents-path terms when `sumsubTncAccepted` or `idosTncAccepted` are `null` (pre-migration state), preventing invalid T&C2 flag submission on session resume. ([#9908](https://github.com/MetaMask/core/pull/9908))

[Unreleased]: https://github.com/MetaMask/core/
