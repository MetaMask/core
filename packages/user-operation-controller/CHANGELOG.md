# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0]
### Added
- **BREAKING:** Add required constructor option `entrypoint` to specify address of 4337 entrypoint smart contract ([#3749](https://github.com/MetaMask/core/pull/3749))
- Add `type` and `swaps` properties to `AddUserOperationOptions` ([#3749](https://github.com/MetaMask/core/pull/3749))
- Emit `user-operation-added` event ([#3749](https://github.com/MetaMask/core/pull/3749))

### Changed
- Use zero values when estimating gas with bundler ([#3749](https://github.com/MetaMask/core/pull/3749))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/user-operation-controller@1.0.0...HEAD
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/user-operation-controller@1.0.0
