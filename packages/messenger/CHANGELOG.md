# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Migrate `Messenger` class from `@metamask/base-controller` package ([#6127](https://github.com/MetaMask/core/pull/6127))
- Add `delegate` and `revoke` methods ([#6132](https://github.com/MetaMask/core/pull/6132))
  - These allow delegating or revoking capabilities (actions or events) from one `Messenger` instance to another.
  - This allows passing capabilities through chains of messengers of arbitrary length
  - See this ADR for details: https://github.com/MetaMask/decisions/blob/main/decisions/core/0012-messenger-delegation.md

### Changed

- **BREAKING:** Add `Namespace` type parameter and required `namespace` constructor parameter ([#6132](https://github.com/MetaMask/core/pull/6132))
  - All published events and registered actions should fall under the given namespace. Typically the namespace is the controller or service name. This is the equivalent to the `Namespace` parameter from the old `RestrictedMessenger` class.
- **BREAKING:** Remove `RestrictedMessenger` class ([#6132](https://github.com/MetaMask/core/pull/6132))
  - Existing `RestrictedMessenger` instances should be replaced with a `Messenger`. We can now use the same class everywhere, passing capabilities using `delegate`.
  - See this ADR for details: https://github.com/MetaMask/decisions/blob/main/decisions/core/0012-messenger-delegation.md

[Unreleased]: https://github.com/MetaMask/core/
