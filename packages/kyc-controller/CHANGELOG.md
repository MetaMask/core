# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add session-scoped disclaimer APIs on `KycService` for the idOS / KYC-provider catalog ([#9979](https://github.com/MetaMask/core/pull/9979)):
  - `fetchSessionDisclaimers({ sessionId })` calls `GET /sessions/{sessionId}/disclaimers`
  - `submitSessionDisclaimers({ sessionId, idOS, kycProvider, credentialReusabilityConsentGiven })` calls `POST /sessions/{sessionId}/disclaimers`
- Add `KycService.submitVendorDisclaimers({ vendor, disclaimerIds })` (`POST /vendors/{vendor}/disclaimers`) to record Iron T&C signings, plus the `KycVendorSigning` response type. The consents path calls this alongside session-scoped disclaimers; vendor T&C ids are no longer sent on the session disclaimer POST. ([#9979](https://github.com/MetaMask/core/pull/9979))
- Add `KycConsentDocument`, `KycConsentRecord`, and `KycSessionDisclaimers` types for that catalog, plus in-memory `credentialReusabilityConsentGiven` and `sessionDisclaimers` controller state. `acceptTermsAndStartSession` forwards optional `credentialReusabilityConsentGiven` (default `false`). ([#9979](https://github.com/MetaMask/core/pull/9979))
- Parameterize Universal KYC vendor HTTP on `KycService` so identity vendors share one client surface instead of vendor-branded methods ([#9908](https://github.com/MetaMask/core/pull/9908)):
  - `fetchDisclaimers({ vendor, country })` and `checkKycRequired({ vendor, ... })` call `/vendors/{vendor}/disclaimers` and `/vendors/{vendor}/kyc-required` (`vendor` defaults to `moonpay`)
  - `createVendorCustomer({ vendor, email })` calls `POST /vendors/{vendor}/customers`
  - `fetchKycStatus()` reads `GET /kyc/status`
- Add a consents-path KYC flow on `KycController` for non-MoonPay vendors (currently `iron`): empty-shell customer → disclaimers → consents → SumSub, skipping MoonPay Check/Auth frames. `initialize({ vendor })` and `createVendorCustomer({ vendor, email })` drive the path; `acceptTermsAndStartSession` requires `sumsubTncSigned` / `idosTncSigned`. ([#9908](https://github.com/MetaMask/core/pull/9908))
- Add `KycController.refreshKycStatus()` and the `KycController:statusChanged` event so consumers can poll user-keyed KYC status for toast / banner surfaces. ([#9908](https://github.com/MetaMask/core/pull/9908))
- Add `KycController.getCustomerIdentity()` (and `KycCustomerIdentity`) returning the vendor-scoped `{ vendor, id }` for the current session, or `null` before authentication and after `reset()`. ([#9908](https://github.com/MetaMask/core/pull/9908))
- Extend `KycProduct` with `'money'` and `KycVendor` with `'iron'`. ([#9908](https://github.com/MetaMask/core/pull/9908))
- Add `KycUserStatus` / `KycUserStatusResponse` types for the simplified `GET /kyc/status` payload. ([#9908](https://github.com/MetaMask/core/pull/9908))
- Add persisted `termsAcceptedVendor` state recording which vendor's disclaimers `acceptedDisclaimerIds` belong to, so stored acceptance is only reused for that vendor. ([#9908](https://github.com/MetaMask/core/pull/9908))
- Add persisted `sumsubTncAccepted` and `idosTncAccepted` state so T&C2 flags can be validated when resuming a consents-path session. ([#9908](https://github.com/MetaMask/core/pull/9908))
- Add `KycController.clearState()` (and the `KycController:clearState` action) restoring the default state, including the fields `reset()` preserves: the session email, terms acceptance, the per-product KYC-required cache and the user-keyed status. Intended for a full wallet reset. ([#9958](https://github.com/MetaMask/core/pull/9958))

### Changed

- **BREAKING:** Replace `KycService.submitConsents` (`POST /consents`) with session-scoped `fetchSessionDisclaimers` / `submitSessionDisclaimers` plus vendor T&C recording via `submitVendorDisclaimers`. Consents now use `{ key, version }` document records plus `credentialReusabilityConsentGiven` instead of Iron disclaimer ids and boolean T&C flags, and they require a UKYC session id. Iron content ids are posted separately to `POST /vendors/{vendor}/disclaimers`. The consents path records vendor T&Cs, then creates the UKYC session, then records session disclaimers. A 409 conflict is re-checked with a GET and only treated as success when every accepted document is consented. ([#9979](https://github.com/MetaMask/core/pull/9979))
- Make the `fetch` option on the `KycService` constructor optional; it now defaults to the runtime's native `fetch` (browser, React Native, Node 18+), so consumers no longer need to inject one. ([#9908](https://github.com/MetaMask/core/pull/9908))
- **BREAKING:** Invalidate terms acceptance when `termsAcceptedVendor` is `null` (pre-migration state), forcing reacceptance after the multi-vendor upgrade to ensure users review current vendor terms. ([#9908](https://github.com/MetaMask/core/pull/9908))
- **BREAKING:** Require `sumsubTncSigned` and `idosTncSigned` on `acceptTermsAndStartSession` for every vendor, so callers explicitly declare T&C2 acceptance. Zero-argument calls and omitted flags fail instead of defaulting to `true`. ([#9908](https://github.com/MetaMask/core/pull/9908))
- Rename `CreateUkycSessionParams.vendorId` to `vendor` for consistency with other service methods. ([#9908](https://github.com/MetaMask/core/pull/9908))
- Bump `@metamask/base-data-service` from `^0.1.3` to `^1.0.0` ([#9972](https://github.com/MetaMask/core/pull/9972))

### Fixed

- Clear leftover MoonPay `sessionToken`, `accessToken`, and Check/Auth frame credentials when `initialize` or `createVendorCustomer` switches to another vendor, so `buildCheckFrameUrl` cannot return a MoonPay URL for a consents-path session. ([#9908](https://github.com/MetaMask/core/pull/9908))
- Rewind the consents path when SumSub fails before completion (thrown step or SDK close without `Completed`), instead of refreshing user status and forcing `phase` to `done`. A terminal UKYC rejection after the SDK completed still finishes as `done` so the decision can be reflected in user status. ([#9908](https://github.com/MetaMask/core/pull/9908))
- Make `createVendorCustomer` a no-op during in-progress phases (matching `initialize`), so a vendor switch cannot leave Check/Auth frames attached to the wrong vendor. ([#9908](https://github.com/MetaMask/core/pull/9908))
- Ignore Check/Auth frame completion unless the active vendor is MoonPay, and do not return a MoonPay customer id from `getCustomerIdentity()` under another vendor. ([#9908](https://github.com/MetaMask/core/pull/9908))
- Drop persisted terms acceptance on a vendor switch only after `createVendorCustomer` succeeds, so a failed or reset Money start cannot erase another vendor's stored acceptance. ([#9908](https://github.com/MetaMask/core/pull/9908))
- Clear `moonpayCustomerId` when the active vendor is not MoonPay, so `getCustomerIdentity()` cannot report a MoonPay customer id under another vendor. ([#9908](https://github.com/MetaMask/core/pull/9908))
- Call `unref()` on the user-status poll timer only when it exists. React Native and browser timers are numbers, so an unconditional `unref()` threw when status polling started outside Node. ([#9908](https://github.com/MetaMask/core/pull/9908))
- Skip the `session_not_in_valid_state` completion write when a `reset()` superseded the SumSub flow, so a late vendor response can no longer force `userStatus` to `completed` (and publish `statusChanged`) on an idle controller. ([#9908](https://github.com/MetaMask/core/pull/9908))
- Stop `initialize()` once a `reset()` or `clearState()` has superseded it, so a geolocation response arriving afterwards can no longer move the controller into the `terms` phase or reload disclaimers onto a controller that was just reset. ([#9958](https://github.com/MetaMask/core/pull/9958))
- Validate that `accessToken` and `country` are provided when calling `checkKycRequired` with vendor `moonpay`, failing fast with a clear error instead of posting `undefined` values to the API. ([#9908](https://github.com/MetaMask/core/pull/9908))
- Check for global `fetch` availability before binding in `KycService` constructor, throwing a descriptive error if `fetch` is neither provided nor globally available (e.g. older Node environments). ([#9908](https://github.com/MetaMask/core/pull/9908))
- Check for null bearer token before calling `assert()` in `#requestJson`, ensuring the custom "wallet signed in" error message is shown instead of a generic superstruct error. ([#9908](https://github.com/MetaMask/core/pull/9908))
- Require reacceptance of consents-path terms when `sumsubTncAccepted` or `idosTncAccepted` are `null` (pre-migration state), preventing invalid T&C2 flag submission on session resume. ([#9908](https://github.com/MetaMask/core/pull/9908))

[Unreleased]: https://github.com/MetaMask/core/
