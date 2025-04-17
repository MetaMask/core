# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial implementation of the seedless onboarding controller. ([#5671](https://github.com/MetaMask/core/pull/5671))
  - Authenticate OAuth user using the seedless onboarding flow and determine if the user is already registered or not
  - Create a new Toprf key and backup seed phrase
  - Add a new seed phrase backup to the metadata store
  - Add array of new seed phrase backups to the metadata store in batch (useful in multi-srp flow)
  - Fetch seed phrase metadata from the metadata store
  - Update the password of the seedless onboarding flow

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/seedless-onboarding-controller@0.0.0...HEAD
