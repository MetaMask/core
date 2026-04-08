# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- PasskeyController for passkey state management
- Orchestration functions for passkey enrollment and unlock (adaptive PRF + userHandle)
- Crypto utilities (HKDF-SHA256, AES-256-GCM) for password encryption/decryption

### Changed

- Store `PasskeyRecord.credentialId` as standard base64 (not base64url).

[Unreleased]: https://github.com/MetaMask/core/
