# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- Upgrade to TypeScript v5.0 and set `module{,Resolution}` option to `Node16` ([#3645](https://github.com/MetaMask/core/pull/3645))
- Bump `@metamask/utils` from `^9.0.0` to `^9.1.0` ([#4529](https://github.com/MetaMask/core/pull/4529))
- Release/172.0.0 ([#4517](https://github.com/MetaMask/core/pull/4517))
- chore(deps): Bump `@metamask/utils` to `^9.0.0`, `@metamask/rpc-errors` to `^6.3.1` ([#4516](https://github.com/MetaMask/core/pull/4516))
- Please hold off on new releases of this package until the yarn resolution for `@metamask/providers` is removed.
  - This is blocked by a `@metamask/snaps-sdk` release with `@metamask/providers` bumped to `>=17.1.1`.
    - See: [Fix regressions introduced by @metamask/providers@17.1.1](https://github.com/MetaMask/snaps/pull/2579)
  - Build error fixed by yarn resolution: [MetaMask/core/actions/runs/10011688901/job/27675682526?pr=3645](https://github.com/MetaMask/core/actions/runs/10011688901/job/27675682526?pr=3645)

## [0.1.0]

### Changed

- Initial release

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/chain-controller@0.1.0...HEAD
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/chain-controller@0.1.0
