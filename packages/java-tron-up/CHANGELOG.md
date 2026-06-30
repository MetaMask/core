# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0]

### Added

- Add the `@metamask/java-tron-up` package ([#9208](https://github.com/MetaMask/core/pull/9208)).

### Changed

- Adopt `@metamask/local-node-utils` for shared installer utilities ([#9235](https://github.com/MetaMask/core/pull/9235)).
- Bump `@metamask/local-node-utils` from `^0.0.0` to `^1.0.0` ([#9314](https://github.com/MetaMask/core/pull/9314)).

### Fixed

- Parse `.yarnrc.yml` as YAML when detecting Yarn global cache, matching
  `@metamask/foundryup`.
- Merge partial `fullNode` and `javaRuntime` overrides from `package.json` with
  the pinned defaults instead of replacing them.
- Re-verify the cached Java runtime checksum on reuse via a `.source-checksum`
  marker.
- Propagate child termination signals from the generated `java-tron` wrapper as a
  non-zero exit.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/java-tron-up@1.0.0...HEAD
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/java-tron-up@1.0.0
