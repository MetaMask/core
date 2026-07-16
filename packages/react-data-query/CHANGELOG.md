# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.2]

### Changed

- **BREAKING:** Constrain `createUIQueryClient`'s messenger-like type to match the given data services ([#9475](https://github.com/MetaMask/core/pull/9475))
  - The messenger-like object that `createUIQueryClient` takes must minimally support actions or `:cacheUpdated:${hash}` events which are namespaced by the provided data service names.
  - If you're passing a messenger, it should "just work" as long as your messenger supports the right actions and events.
  - If you're passing a messenger adapter defined in its own variable, you may need to update its type. See `MessengerAdapter` in `packages/react-data-query/src/createUIQueryClient.ts` for an example.
  - If you're passing a messenger adapter directly (it is not defined in its own variable), then it should also "just work".
- The types for `createUIQueryClient` no longer check that the provided messenger's actions are JSON-compatible ([#9475](https://github.com/MetaMask/core/pull/9475))
  - If you are experiencing any errors calling actions through the query client, check to make sure their parameters are JSON-compatible.
- Bump `@metamask/utils` from `^11.9.0` to `^11.11.0` ([#9074](https://github.com/MetaMask/core/pull/9074))
- Make `react-dom` and `react-native` peer dependencies optional ([#9295](https://github.com/MetaMask/core/pull/9295))

### Fixed

- Retain queries in cache until GC ([#9502](https://github.com/MetaMask/core/pull/9502))

## [0.2.1]

### Changed

- Bump `@metamask/base-data-service` from `^0.1.0` to `^0.1.3` ([#8317](https://github.com/MetaMask/core/pull/8317), [#8755](https://github.com/MetaMask/core/pull/8755), [#8799](https://github.com/MetaMask/core/pull/8799))

## [0.2.0]

### Added

- Allow passing additional configuration options to `createUIQueryClient` ([#8295](https://github.com/MetaMask/core/pull/8295))
- Move data service specific query configuration to hooks instead of `QueryClient` defaults ([#8296](https://github.com/MetaMask/core/pull/8296))

## [0.1.0]

### Added

- Initial release ([#8039](https://github.com/MetaMask/core/pull/8039), [#8292](https://github.com/MetaMask/core/pull/8292))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/react-data-query@0.2.2...HEAD
[0.2.2]: https://github.com/MetaMask/core/compare/@metamask/react-data-query@0.2.1...@metamask/react-data-query@0.2.2
[0.2.1]: https://github.com/MetaMask/core/compare/@metamask/react-data-query@0.2.0...@metamask/react-data-query@0.2.1
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/react-data-query@0.1.0...@metamask/react-data-query@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/react-data-query@0.1.0
