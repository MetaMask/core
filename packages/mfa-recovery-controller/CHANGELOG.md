# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `MfaRecoveryController` with injectable `RecoveryAuthProvider` and `RecoveryEscrowProvider` interfaces, a persisted `idle` / `authorizing` / `writing` mutation state machine, and `register`, `updateRecoverySecret`, `updateIdentifiers`, `getRecoverySecret`, `resume`, and `abort` methods

[Unreleased]: https://github.com/MetaMask/core/
