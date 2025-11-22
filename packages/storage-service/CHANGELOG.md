# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release of `@metamask/storage-service`
- Add `StorageService` class for platform-agnostic storage
- Add `StorageAdapter` interface for platform-specific implementations
- Add `InMemoryStorageAdapter` as default storage (for tests/dev)
- Add namespace-based key isolation
- Add support for `setItem`, `getItem`, `removeItem`, `getAllKeys`, and `clearNamespace` operations
- Add messenger integration for cross-controller communication
- Add comprehensive test coverage

[Unreleased]: https://github.com/MetaMask/core/tree/main/packages/storage-service

