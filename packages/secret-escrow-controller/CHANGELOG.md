# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release of `@metamask/secret-escrow-controller` for WebAuthn-gated secret escrow enrollment and export
- `enrollAndWrapPassword` / `recoverPassword` for social-login password coexistence
- Optional mock client snapshot persistence in controller state
- `hydrateFromRemote` to restore enrollment metadata from an HTTP mock / remote escrow after wipe

[Unreleased]: https://github.com/MetaMask/core/
