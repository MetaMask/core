# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release ([#7693](https://github.com/MetaMask/core/pull/7693))
- Add `AiDigestController` for fetching and caching AI-generated asset digests ([#7746](https://github.com/MetaMask/core/pull/7746))
- Add Market Insights support to `AiDigestController` with `fetchMarketInsights` action ([#7930](https://github.com/MetaMask/core/pull/7930))
- Add `searchDigest` method to `AiDigestService` for calling the GET endpoint (currently mocked) ([#7930](https://github.com/MetaMask/core/pull/7930))

### Removed

- Remove legacy digest APIs and digest cache from `AiDigestController` and `AiDigestService`; only market insights APIs remain.
  - Removes `fetchDigest`, `clearDigest`, and `clearAllDigests` actions from the controller action surface.
  - Removes `DigestData`/`DigestEntry` types and the `digests` state branch.

[Unreleased]: https://github.com/MetaMask/core/
