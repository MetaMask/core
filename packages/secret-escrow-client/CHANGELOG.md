# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release of `@metamask/secret-escrow-client` with `SecretEscrowClient` types, errors, and in-memory `MockSecretEscrowClient`
- Mock snapshot export/import for local-dev persistence across process restarts
- `HttpSecretEscrowClient` and file-backed `yarn mock-server` for wipe/rehydration testing
- Enrollment metadata types for persisting wrapped password outside the extension

[Unreleased]: https://github.com/MetaMask/core/
