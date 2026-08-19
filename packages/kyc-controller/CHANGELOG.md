# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Parameterize Universal KYC vendor HTTP on `KycService` so identity vendors share one client surface instead of vendor-branded methods:
  - `fetchDisclaimers({ vendor, country })` and `checkKycRequired({ vendor, ... })` call `/vendors/{vendor}/disclaimers` and `/vendors/{vendor}/kyc-required` (`vendor` defaults to `moonpay`)
  - `createVendorCustomer({ vendor, email })` calls `POST /vendors/{vendor}/customers`
  - `submitConsents({ disclaimerIds, ... })` posts `POST /consents` (wire body still uses `ironDisclaimerIds`)
  - `fetchKycStatus()` reads `GET /kyc/status`
- Add a consents-path KYC flow on `KycController` for non-MoonPay vendors (currently `iron`): empty-shell customer → disclaimers → consents → SumSub, skipping MoonPay Check/Auth frames. `initialize({ vendor })` and `createVendorCustomer({ vendor, email })` drive the path; `acceptTermsAndStartSession` still takes optional `sumsubTncSigned` / `idosTncSigned` (ignored for MoonPay).
- Add `KycController.refreshKycStatus()` and the `KycController:statusChanged` event so consumers can poll user-keyed KYC status for toast / banner surfaces.
- Add `KycController.getCustomerIdentity()` (and `KycCustomerIdentity`) returning the vendor-scoped `{ vendor, id }` for the current session, or `null` before authentication and after `reset()`.
- Extend `KycProduct` with `'money'` and `KycVendor` with `'iron'`.
- Add `KycUserStatus` / `KycUserStatusResponse` types for the simplified `GET /kyc/status` payload.

### Changed

- Make the `fetch` option on the `KycService` constructor optional; it now defaults to the runtime's native `fetch` (browser, React Native, Node 18+), so consumers no longer need to inject one.

### Fixed

- Clear `moonpayCustomerId` when the active vendor is not MoonPay, so `getCustomerIdentity()` cannot report a MoonPay customer id under another vendor.
- Call `unref()` on the user-status poll timer only when it exists. React Native and browser timers are numbers, so an unconditional `unref()` threw when status polling started outside Node.
- Skip the `session_not_in_valid_state` completion write when a `reset()` superseded the SumSub flow, so a late vendor response can no longer force `userStatus` to `completed` (and publish `statusChanged`) on an idle controller.

[Unreleased]: https://github.com/MetaMask/core/
