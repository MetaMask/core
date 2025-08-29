# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Allow disabling namespace checks in unit tests using the new `DISABLE_NAMESPACE` constant ([#6420](https://github.com/MetaMask/core/pull/6420))
  - To disable namespace checks, use `string` as the `Namespace` type parameter, and use `DISABLE_NAMESPACE` as the `namespace` constructor parameter.

### Changed

- Keep delegated handlers when unregistering actions ([#6395](https://github.com/MetaMask/core/pull/6395))

## [0.1.0]

### Added

- Migrate `Messenger` class from `@metamask/base-controller` package ([#6127](https://github.com/MetaMask/core/pull/6127))
- Add `delegate` and `revoke` methods ([#6132](https://github.com/MetaMask/core/pull/6132))
  - These allow delegating or revoking capabilities (actions or events) from one `Messenger` instance to another.
  - This allows passing capabilities through chains of messengers of arbitrary length
  - See this ADR for details: https://github.com/MetaMask/decisions/blob/main/decisions/core/0012-messenger-delegation.md
- Add `parent` constructor parameter and type parameter to `Messenger` ([#6142](https://github.com/MetaMask/core/pull/6142))
  - All capabilities registered under this messenger's namespace are delegated to the parent automatically. This is similar to how the `RestrictedMessenger` would automatically delegate all capabilities to the messenger it was created from.
- Add `MessengerActions` and `MessengerEvents` utility types for extracting actions/events from a `Messenger` type ([#6317](https://github.com/MetaMask/core/pull/6317))

### Changed

- **BREAKING:** Add `Namespace` type parameter and required `namespace` constructor parameter ([#6132](https://github.com/MetaMask/core/pull/6132))
  - All published events and registered actions should fall under the given namespace. Typically the namespace is the controller or service name. This is the equivalent to the `Namespace` parameter from the old `RestrictedMessenger` class.
- **BREAKING:** The `type` property of `ActionConstraint` and `EventConstraint` is now a `NamespacedName` rather than a string ([#6132](https://github.com/MetaMask/core/pull/6132))
- Add default for `ReturnHandler` type parameter of `SelectorEventHandler` and `SelectorFunction` ([#6262](https://github.com/MetaMask/core/pull/6262), [#6264](https://github.com/MetaMask/core/pull/6264))
- Add default of `never` to action and event type parameters of `Messenger` ([#6311](https://github.com/MetaMask/core/pull/6311))

### Removed

- **BREAKING:** Remove `RestrictedMessenger` class ([#6132](https://github.com/MetaMask/core/pull/6132))
  - Existing `RestrictedMessenger` instances should be replaced with a `Messenger` with the `parent` constructor parameter set to the global messenger. We can now use the same class everywhere, passing capabilities using `delegate`.
  - See this ADR for details: https://github.com/MetaMask/decisions/blob/main/decisions/core/0012-messenger-delegation.md

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/messenger@0.1.0...HEAD
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/messenger@0.1.0
