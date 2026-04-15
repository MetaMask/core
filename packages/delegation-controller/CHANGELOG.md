# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- Revert "Release 912.0.0 (#8451)" ([#8451](https://github.com/MetaMask/core/pull/8451))
- Release 912.0.0 ([#8451](https://github.com/MetaMask/core/pull/8451))
- Release/909.0.0 ([#8444](https://github.com/MetaMask/core/pull/8444))
- chore: bump `@metamask/auto-changelog` to `^6.0.0` ([#8441](https://github.com/MetaMask/core/pull/8441))
- chore: Replace Prettier with Oxfmt ([#8434](https://github.com/MetaMask/core/pull/8434))
- feat: extract generate-action-types CLI into @metamask/messenger-cli ([#8378](https://github.com/MetaMask/core/pull/8378))
- feat(messenger): add `generate-action-types` CLI tool as subpath export ([#8264](https://github.com/MetaMask/core/pull/8264))
- Release 890.0.0 ([#8325](https://github.com/MetaMask/core/pull/8325))
- chore: simplify auto-generated file header comment ([#8279](https://github.com/MetaMask/core/pull/8279))
- chore: secure PUBLISH_PREVIEW_NPM_TOKEN with GitHub environment ([#8011](https://github.com/MetaMask/core/pull/8011))
- chore: upgrade `typedoc` from `^0.24.8` to `^0.25.13` ([#7898](https://github.com/MetaMask/core/pull/7898))
- chore: migrate Jest from v27 to v29 ([#7894](https://github.com/MetaMask/core/pull/7894))
- chore: upgrade Jest-related packages to latest 27.x versions ([#7792](https://github.com/MetaMask/core/pull/7792))
- chore: Update ESLint config packages to v15 ([#7305](https://github.com/MetaMask/core/pull/7305))
- chore: Re-enable `@typescript-eslint/no-unnecessary-type-assertions` ([#7296](https://github.com/MetaMask/core/pull/7296))
- Revert "Release 687.0.0" ([#7201](https://github.com/MetaMask/core/pull/7201))
- Release 687.0.0 ([#7190](https://github.com/MetaMask/core/pull/7190))
- chore: Update `typescript` to v5.3 ([#7081](https://github.com/MetaMask/core/pull/7081))
- fix: Fix build script not working because of missing `@ts-bridge/cli` dependency ([#7040](https://github.com/MetaMask/core/pull/7040))
- chore(dev-deps): Bump `@ts-bridge/cli` from `^0.6.1` to `^0.6.4` ([#7039](https://github.com/MetaMask/core/pull/7039))
- feat: New `base-controller` API ([#6926](https://github.com/MetaMask/core/pull/6926))
- Release 641.0.0 ([#6940](https://github.com/MetaMask/core/pull/6940))
- Release/549.0.0 ([#6590](https://github.com/MetaMask/core/pull/6590))
- Release/546.0.0 ([#6572](https://github.com/MetaMask/core/pull/6572))
- Release/492.0.0 ([#6273](https://github.com/MetaMask/core/pull/6273))
- Release/479.0.0 ([#6194](https://github.com/MetaMask/core/pull/6194))
- Release 456.0.0 ([#6064](https://github.com/MetaMask/core/pull/6064))
- Release 429.0.0 ([#5930](https://github.com/MetaMask/core/pull/5930))
- Release 416.0.0 ([#5885](https://github.com/MetaMask/core/pull/5885))
- Release 384.0.0 ([#5749](https://github.com/MetaMask/core/pull/5749))
- Release 376.0.0 ([#5713](https://github.com/MetaMask/core/pull/5713))
- Release/366.0.0 ([#5666](https://github.com/MetaMask/core/pull/5666))
- Release 363.0.0 ([#5658](https://github.com/MetaMask/core/pull/5658))

### Changed

- Bump `@metamask/base-controller` from `^9.0.1` to `^9.1.0` ([#8457](https://github.com/MetaMask/core/pull/8457))

## [3.0.0]

### Changed

- Bump `@metamask/keyring-controller` from `^25.1.1` to `^25.2.0` ([#8363](https://github.com/MetaMask/core/pull/8363))
- Bump `@metamask/messenger` from `^1.0.0` to `^1.1.1` ([#8364](https://github.com/MetaMask/core/pull/8364), [#8373](https://github.com/MetaMask/core/pull/8373))

### Removed

- **BREAKING:** Remove persisted `delegations` state ([#8330](https://github.com/MetaMask/core/pull/8330))
  - `store`, `list`, `retrieve`, `chain`, and `delete` methods (and related messenger action types)
  - `DelegationEntry` type export
  - Remove dependency on `@metamask/accounts-controller` - callers no longer need to delegate the `AccountsController:getSelectedAccount` action to the `DelegationController` messenger

## [2.1.0]

### Added

- Export `DelegationControllerGetStateAction` type ([#8205](https://github.com/MetaMask/core/pull/8205))

### Changed

- Bump `@metamask/accounts-controller` from `^37.0.0` to `^37.1.0` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/base-controller` from `^9.0.0` to `^9.0.1` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/keyring-controller` from `^25.1.0` to `^25.1.1` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/messenger` from `^0.3.0` to `^1.0.0` ([#8317](https://github.com/MetaMask/core/pull/8317))

## [2.0.2]

### Changed

- Bump `@metamask/accounts-controller` from `^36.0.0` to `^37.0.0` ([#7996](https://github.com/MetaMask/core/pull/7996)), ([#8140](https://github.com/MetaMask/core/pull/8140))

## [2.0.1]

### Changed

- Upgrade `@metamask/utils` from `^11.8.1` to `^11.9.0` ([#7511](https://github.com/MetaMask/core/pull/7511))
- Move peer dependencies for controller and service packages to direct dependencies ([#7209](https://github.com/MetaMask/core/pull/7209), [#7604](https://github.com/MetaMask/core/pull/7604), [#7642](https://github.com/MetaMask/core/pull/7642), [#7713](https://github.com/MetaMask/core/pull/7713)), ([#7897](https://github.com/MetaMask/core/pull/7897))
  - The dependencies moved are:
    - `@metamask/accounts-controller` (^36.0.0)
    - `@metamask/keyring-controller` (^25.1.0)
  - In clients, it is now possible for multiple versions of these packages to exist in the dependency tree.
    - For example, this scenario would be valid: a client relies on `@metamask/controller-a` 1.0.0 and `@metamask/controller-b` 1.0.0, and `@metamask/controller-b` depends on `@metamask/controller-a` 1.1.0.
  - Note, however, that the versions specified in the client's `package.json` always "win", and you are expected to keep them up to date so as not to break controller and service intercommunication.

## [2.0.0]

### Changed

- **BREAKING:** Bump `@metamask/keyring-controller` from `^24.0.0` to `^25.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- **BREAKING:** Bump `@metamask/accounts-controller` from `^34.0.0` to `^35.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))

## [1.0.0]

### Changed

- **BREAKING:** Use new `Messenger` from `@metamask/messenger` ([#6459](https://github.com/MetaMask/core/pull/6459))
  - Previously, `DelegationController` accepted a `RestrictedMessenger` instance from `@metamask/base-controller`.
- **BREAKING:** Metadata property `anonymous` renamed to `includeInDebugSnapshot` ([#6459](https://github.com/MetaMask/core/pull/6459))
- **BREAKING:** Bump `@metamask/accounts-controller` from `^33.0.0` to `^34.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))
- **BREAKING:** Bump `@metamask/keyring-controller` from `^23.0.0` to `^24.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))
- Bump `@metamask/base-controller` from `^8.4.2` to `^9.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))

## [0.8.1]

### Changed

- Bump `@metamask/base-controller` from `^8.4.1` to `^8.4.2` ([#6917](https://github.com/MetaMask/core/pull/6917))

## [0.8.0]

### Added

- Add two new controller state metadata properties: `includeInStateLogs` and `usedInUi` ([#6531](https://github.com/MetaMask/core/pull/6531))

### Changed

- Bump `@metamask/base-controller` from `^8.1.0` to `^8.4.1` ([#6355](https://github.com/MetaMask/core/pull/6355), [#6465](https://github.com/MetaMask/core/pull/6465), [#6632](https://github.com/MetaMask/core/pull/6632), [#6807](https://github.com/MetaMask/core/pull/6807))
- Bump `@metamask/utils` from `^11.4.2` to `^11.8.1` ([#6588](https://github.com/MetaMask/core/pull/6588), [#6708](https://github.com/MetaMask/core/pull/6708))

## [0.7.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` from `^32.0.0` to `^33.0.0` ([#6345](https://github.com/MetaMask/core/pull/6345))
- **BREAKING:** Bump peer dependency `@metamask/keyring-controller` from `^22.0.0` to `^23.0.0` ([#6345](https://github.com/MetaMask/core/pull/6345))
- Bump `@metamask/base-controller` from `^8.0.1` to `^8.1.0` ([#6284](https://github.com/MetaMask/core/pull/6284))

## [0.6.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` to `^32.0.0` ([#6171](https://github.com/MetaMask/core/pull/6171))
- Bump `@metamask/utils` from `^11.2.0` to `^11.4.2` ([#6054](https://github.com/MetaMask/core/pull/6054))

## [0.5.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` to `^31.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))

## [0.4.0]

### Changed

- **BREAKING:** bump `@metamask/accounts-controller` peer dependency to `^30.0.0` ([#5888](https://github.com/MetaMask/core/pull/5888))

## [0.3.0]

### Changed

- **BREAKING:** bump `@metamask/keyring-controller` peer dependency to `^22.0.0` ([#5802](https://github.com/MetaMask/core/pull/5802))
- **BREAKING:** bump `@metamask/accounts-controller` peer dependency to `^29.0.0` ([#5802](https://github.com/MetaMask/core/pull/5802))

## [0.2.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` to `^28.0.0` ([#5763](https://github.com/MetaMask/core/pull/5763))
- Bump `@metamask/base-controller` from `^8.0.0` to `^8.0.1` ([#5722](https://github.com/MetaMask/core/pull/5722))

## [0.1.0]

### Added

- Initial release ([#5592](https://github.com/MetaMask/core/pull/5592))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/delegation-controller@3.0.0...HEAD
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/delegation-controller@2.1.0...@metamask/delegation-controller@3.0.0
[2.1.0]: https://github.com/MetaMask/core/compare/@metamask/delegation-controller@2.0.2...@metamask/delegation-controller@2.1.0
[2.0.2]: https://github.com/MetaMask/core/compare/@metamask/delegation-controller@2.0.1...@metamask/delegation-controller@2.0.2
[2.0.1]: https://github.com/MetaMask/core/compare/@metamask/delegation-controller@2.0.0...@metamask/delegation-controller@2.0.1
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/delegation-controller@1.0.0...@metamask/delegation-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/compare/@metamask/delegation-controller@0.8.1...@metamask/delegation-controller@1.0.0
[0.8.1]: https://github.com/MetaMask/core/compare/@metamask/delegation-controller@0.8.0...@metamask/delegation-controller@0.8.1
[0.8.0]: https://github.com/MetaMask/core/compare/@metamask/delegation-controller@0.7.0...@metamask/delegation-controller@0.8.0
[0.7.0]: https://github.com/MetaMask/core/compare/@metamask/delegation-controller@0.6.0...@metamask/delegation-controller@0.7.0
[0.6.0]: https://github.com/MetaMask/core/compare/@metamask/delegation-controller@0.5.0...@metamask/delegation-controller@0.6.0
[0.5.0]: https://github.com/MetaMask/core/compare/@metamask/delegation-controller@0.4.0...@metamask/delegation-controller@0.5.0
[0.4.0]: https://github.com/MetaMask/core/compare/@metamask/delegation-controller@0.3.0...@metamask/delegation-controller@0.4.0
[0.3.0]: https://github.com/MetaMask/core/compare/@metamask/delegation-controller@0.2.0...@metamask/delegation-controller@0.3.0
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/delegation-controller@0.1.0...@metamask/delegation-controller@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/delegation-controller@0.1.0
