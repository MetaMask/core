# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Removed

- Remove chunk files ([#4334](https://github.com/MetaMask/core/pull/4334))
  - Previously, the build tool we used to compile TypeScript to JavaScript files extracted common code to "chunk" files. While this was intended to make this package more tree-shakeable, it also made debugging more difficult for our development teams. These chunk files are no longer present, and each `.js` and `.mjs` file in the package contains the complete source code for that module.

## [0.1.0]

### Changed

- Initial release

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/chain-controller@0.1.0...HEAD
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/chain-controller@0.1.0
