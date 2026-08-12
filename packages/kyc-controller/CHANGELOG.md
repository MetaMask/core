# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release of the `@metamask/kyc-controller` package for managing KYC / identity verification state across MetaMask clients ([#9781](https://github.com/MetaMask/core/pull/9781))
- `buildOwnershipMessage`, which builds the exact proof-of-ownership message required to register a self-hosted wallet with MoonPay Iron ([#9847](https://github.com/MetaMask/core/pull/9847))
- `WalletRegistrationService`, which looks up Monad self-hosted wallet registration status and registers a signed Money Account address via the MetaMask proxy, surfacing typed `WalletRegistrationError` failures ([#9847](https://github.com/MetaMask/core/pull/9847))
- `transition` and `createInitialState`, a pure state machine covering the Money Account signing step, including `409` disambiguation and transient-failure reconciliation ([#9847](https://github.com/MetaMask/core/pull/9847))

[Unreleased]: https://github.com/MetaMask/core/
