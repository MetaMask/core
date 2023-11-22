# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Uncategorized
- Deprecate `BaseControllerV1` and use `BaseControllerV2` as default ([#2078](https://github.com/MetaMask/core/pull/2078))
- Re-enable @typescript-eslint/consistent-type-definitions ([#1933](https://github.com/MetaMask/core/pull/1933))
- Bump @metamask/auto-changelog from 3.4.2 to 3.4.3 ([#1997](https://github.com/MetaMask/core/pull/1997))
- Change `test` build scripts to only show output for failed tests by default ([#1949](https://github.com/MetaMask/core/pull/1949))
- bump `@metamask/auto-changelog` to `^3.4.2` ([#1905](https://github.com/MetaMask/core/pull/1905))
- Add incoming transactions to preferences controller ([#1659](https://github.com/MetaMask/core/pull/1659))
- Bump @metamask/auto-changelog from 3.2.0 to 3.4.0 ([#1870](https://github.com/MetaMask/core/pull/1870))
- Remove `for..in` loops and reenable eslint rules: `guard-for-in`, `no-for-in-array` ([#1865](https://github.com/MetaMask/core/pull/1865))

## [4.4.3]
### Changed
- Bump dependency on `@metamask/base-controller` to ^3.2.3 ([#1747](https://github.com/MetaMask/core/pull/1747))
- Bump dependency on `@metamask/controller-utils` to ^5.0.2 ([#1747](https://github.com/MetaMask/core/pull/1747))

## [4.4.2]
### Changed
- Update TypeScript to v4.8.x ([#1718](https://github.com/MetaMask/core/pull/1718))

## [4.4.1]
### Changed
- Bump dependency on `@metamask/controller-utils` to ^5.0.0

## [4.4.0]
### Added
- Add `isIpfsGatewayEnabled` property to PreferencesController state ([#1577](https://github.com/MetaMask/core/pull/1577))
- Add `setIsIpfsGatewayEnabled` to set `isIpfsGatewayEnabled` ([#1577](https://github.com/MetaMask/core/pull/1577))

### Changed
- Bump dependency on `@metamask/base-controller` to ^3.2.1
- Bump dependency on `@metamask/controller-utils` to ^4.3.2

## [4.3.0]
### Added
- Add preference for security alerts ([#1589](https://github.com/MetaMask/core/pull/1589))

## [4.2.0]
### Added
- Add controller state property `showTestNetworks` along with a setter method, `setShowTestNetworks` ([#1418](https://github.com/MetaMask/core/pull/1418))

## [4.1.0]
### Added
- Add `isMultiAccountBalancesEnabled` to state (default: true) along with a `setIsMultiAccountBalancesEnabled` method to set it

## [4.0.0]
### Changed
- **BREAKING:** Bump to Node 16 ([#1262](https://github.com/MetaMask/core/pull/1262))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@4.4.3...HEAD
[4.4.3]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@4.4.2...@metamask/preferences-controller@4.4.3
[4.4.2]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@4.4.1...@metamask/preferences-controller@4.4.2
[4.4.1]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@4.4.0...@metamask/preferences-controller@4.4.1
[4.4.0]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@4.3.0...@metamask/preferences-controller@4.4.0
[4.3.0]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@4.2.0...@metamask/preferences-controller@4.3.0
[4.2.0]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@4.1.0...@metamask/preferences-controller@4.2.0
[4.1.0]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@4.0.0...@metamask/preferences-controller@4.1.0
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@3.0.0...@metamask/preferences-controller@4.0.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@2.1.0...@metamask/preferences-controller@3.0.0
[2.1.0]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@2.0.0...@metamask/preferences-controller@2.1.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@1.0.2...@metamask/preferences-controller@2.0.0
[1.0.2]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@1.0.1...@metamask/preferences-controller@1.0.2
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/preferences-controller@1.0.0...@metamask/preferences-controller@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/preferences-controller@1.0.0
