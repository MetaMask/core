# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `MoneyAccountSubscriptionController`, a read-only polling controller that hydrates Money Account Plus plan and entitlement flags from the Profile JWT, exposes gating selectors, and supports explicit and event-driven JWT refreshes.

### Changed

- Decode JWT payloads with `@metamask/utils` instead of `atob`.

[Unreleased]: https://github.com/MetaMask/core/
