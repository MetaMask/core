# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0]
### Changed
- **BREAKING:** Update type of state object by renaming `provider` property to `providerConfig` ([#995](https://github.com/MetaMask/controllers/pull/995))
  - Consumers are recommended to add a state migration for this change.
- **BREAKING:** Rename `NetworkController:providerChange` messenger event to `NetworkController:providerConfigChange` ([#995](https://github.com/MetaMask/controllers/pull/995))
- Relax dependencies on `@metamask/base-controller` and `@metamask/controller-utils` (use `^` instead of `~`) ([#998](https://github.com/MetaMask/controllers/pull/998))

## [1.0.0]
### Added
- Initial release
  - As a result of converting our shared controllers repo into a monorepo ([#831](https://github.com/MetaMask/controllers/pull/831)), we've created this package from select parts of [`@metamask/controllers` v33.0.0](https://github.com/MetaMask/controllers/tree/v33.0.0), namely:
    - Everything in `src/network` (minus `NetworkType` and `NetworksChainId`, which were placed in `@metamask/controller-utils`)

    All changes listed after this point were applied to this package following the monorepo conversion.

[Unreleased]: https://github.com/MetaMask/controllers/compare/@metamask/network-controller@2.0.0...HEAD
[2.0.0]: https://github.com/MetaMask/controllers/compare/@metamask/network-controller@1.0.0...@metamask/network-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/controllers/releases/tag/@metamask/network-controller@1.0.0
