# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release of `KycController` and `KycService`, a shared, platform-agnostic KYC / identity-verification controller used across MetaMask clients ([#9615](https://github.com/MetaMask/core/pull/9615))
  - `KycController` (`BaseController`) owns the flow state machine, the Check/Auth frame message protocol, X25519 credential decryption, and SumSub orchestration via an injected `KycSumSubLauncher` adapter.
  - `KycService` performs the Universal KYC (UKYC) HTTP calls via an injected `fetch`, sourcing the auth bearer token and geolocation through the messenger.
  - Exposes a vendor-neutral, per-product surface (`ramps`, `card`) plus reselect selectors.
- Add automatic post-authentication continuation to `KycController` ([#9615](https://github.com/MetaMask/core/pull/9615))
  - `initialize` and `acceptTermsAndStartSession` now accept an optional `product` (`ramps` | `card`), tracked in new `activeProduct` state.
  - When a `product` is set, reaching the `form` phase automatically runs the KYC-required check and, when KYC is required, launches the SumSub document-verification sub-flow — no extra `checkKycRequired` / `startSumSub` calls needed. When no `product` is set, the flow stops at `form` for the consumer to drive manually (unchanged behavior).
- Add optional `baseUrl` option to `KycService` constructor that overrides the base URL derived from `env`, enabling clients to target a custom (e.g. local or staging) KYC API ([#9615](https://github.com/MetaMask/core/pull/9615))
- Add UKYC session-status polling to `KycController` ([#9615](https://github.com/MetaMask/core/pull/9615))
  - After the SumSub SDK reports completion, the controller now polls the UKYC backend for the session's final verification decision instead of treating the SDK result as final. Polling stops on a terminal `finalStatus` (`approved`, `completed`, `rejected`, `failed`, `blocked`), resolving the sub-flow to `complete` (for `approved` / `completed`) or `failed` (otherwise). Polling is also cleared on `reset` and when a new sub-flow starts.
  - Add a new `polling` value to `KycSumSubStatus` and a new `sumsub.sessionStatus` field (typed as the new `KycSessionStatus`) that holds the latest polled status.
  - Add `KycController.getSessionStatus` for a one-off session-status fetch, and add an optional `sessionStatusPollIntervalMs` constructor option (defaults to 15000ms).
  - Add `KycService.getSessionStatus`, backed by the `GET /sessions/{id}/status` endpoint.
- Add handling in `KycController.startSumSub` for applicants already being processed by the vendor ([#9615](https://github.com/MetaMask/core/pull/9615))
  - When UKYC session creation reports `kycStatus: approved` with `finalStatus: pending` (the relay approved the applicant while the vendor is still finalizing), the sub-flow now stops before launching the SumSub SDK, sets the new `vendorProcessing` `KycSumSubStatus`, and surfaces a message via `statusMessage`.
  - `KycService.createUkycSession` now returns optional `kycStatus` and `finalStatus` fields on `UkycSessionResponse`.

[Unreleased]: https://github.com/MetaMask/core/
