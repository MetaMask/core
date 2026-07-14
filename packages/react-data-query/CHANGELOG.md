# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/react-data-query@0.2.1...HEAD
[0.2.1]: https://github.com/MetaMask/core/compare/@metamask/react-data-query@0.2.0...@metamask/react-data-query@0.2.1
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/react-data-query@0.1.0...@metamask/react-data-query@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/react-data-query@0.1.0
