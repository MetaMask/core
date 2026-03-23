# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- chore: secure PUBLISH_PREVIEW_NPM_TOKEN with GitHub environment ([#8011](https://github.com/MetaMask/core/pull/8011))
- chore(messenger): replace `Sinon` with `Jest` mocks ([#7959](https://github.com/MetaMask/core/pull/7959))
- chore: upgrade `typedoc` from `^0.24.8` to `^0.25.13` ([#7898](https://github.com/MetaMask/core/pull/7898))
- chore: migrate Jest from v27 to v29 ([#7894](https://github.com/MetaMask/core/pull/7894))
- chore: upgrade Jest-related packages to latest 27.x versions ([#7792](https://github.com/MetaMask/core/pull/7792))
- chore: Fix suppressed lint errors in `@metamask/messenger` ([#7421](https://github.com/MetaMask/core/pull/7421))
- chore: Re-enable `@typescript-eslint/prefer-optional-chain` ([#7314](https://github.com/MetaMask/core/pull/7314))
- chore: Update ESLint config packages to v15 ([#7305](https://github.com/MetaMask/core/pull/7305))
- chore: Update `typescript` to v5.3 ([#7081](https://github.com/MetaMask/core/pull/7081))
- fix: Fix build script not working because of missing `@ts-bridge/cli` dependency ([#7040](https://github.com/MetaMask/core/pull/7040))

## [0.3.0]

### Added

- Add `captureException` constructor parameter ([#6605](https://github.com/MetaMask/core/pull/6605))
  - This function will be used to capture any errors thrown from subscribers.
  - If this is unset but a parent is provided, `captureException` is inherited from the parent.

### Changed

- Stop re-throwing subscriber errors in a `setTimeout` ([#6605](https://github.com/MetaMask/core/pull/6605))
  - Instead errors are captured with `captureException`, or logged to the console.

## [0.2.0]

### Added

- Allow disabling namespace checks in unit tests using the new `MOCK_ANY_NAMESPACE` constant and `MockAnyNamespace` type ([#6420](https://github.com/MetaMask/core/pull/6420))
  - To disable namespace checks, use `MockAnyNamespace` as the `Namespace` type parameter, and use `MOCK_ANY_NAMESPACE` as the `namespace` constructor parameter.

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/messenger@0.3.0...HEAD
[0.3.0]: https://github.com/MetaMask/core/compare/@metamask/messenger@0.2.0...@metamask/messenger@0.3.0
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/messenger@0.1.0...@metamask/messenger@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/messenger@0.1.0
