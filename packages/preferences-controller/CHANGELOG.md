# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.0.0]
### Changed
- **BREAKING:** Migrate network configurations from `PreferencesController` to `NetworkController` ([#1064](https://github.com/MetaMask/core/pull/1064))
  - Consumers will need to adapt by reading network data from `NetworkConfigurations` state on `NetworkController` rather than `frequentRpcList` on `PreferencesController`. See `NetworkController` v6.0.0 changelog entry for more details.

## [2.1.0]
### Added
- `disabledRpcMethodPreferences` state to PreferencesController ([#1109](https://github.com/MetaMask/core/pull/1109)). See [this PR on extension](https://github.com/MetaMask/metamask-extension/pull/17308) and [this ticket](https://github.com/MetaMask/metamask-mobile/issues/5676)

## [2.0.0]
### Removed
- **BREAKING:** Remove `isomorphic-fetch` ([#1106](https://github.com/MetaMask/controllers/pull/1106))
  - Consumers must now import `isomorphic-fetch` or another polyfill themselves if they are running in an environment without `fetch`

## [1.0.2]
### Changed
- Rename this repository to `core` ([#1031](https://github.com/MetaMask/controllers/pull/1031))
- Update `@metamask/controller-utils` package ([#1041](https://github.com/MetaMask/controllers/pull/1041)) 

## [1.0.1]
### Changed
- Relax dependencies on `@metamask/base-controller` and `@metamask/controller-utils` (use `^` instead of `~`) ([#998](https://github.com/MetaMask/core/pull/998))

## [1.0.0]
### Added
- Initial release
  - As a result of converting our shared controllers repo into a monorepo ([#831](https://github.com/MetaMask/core/pull/831)), we've created this package from select parts of [`@metamask/controllers` v33.0.0](https://github.com/MetaMask/core/tree/v33.0.0), namely:
    - `src/user/PreferencesController.ts` (plus `ContactEntry` copied from `src/user/AddressBookController.ts`)
    - `src/user/PreferencesController.test.ts`

    All changes listed after this point were applied to this package following the monorepo conversion.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@3.0.0...HEAD
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@2.1.0...@metamask/preferences-controller@3.0.0
[2.1.0]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@2.0.0...@metamask/preferences-controller@2.1.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@1.0.2...@metamask/preferences-controller@2.0.0
[1.0.2]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@1.0.1...@metamask/preferences-controller@1.0.2
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@1.0.0...@metamask/preferences-controller@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/preferences-controller@1.0.0
