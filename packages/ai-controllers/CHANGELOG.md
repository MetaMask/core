# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Strengthen `AiDigestService` response validation using nested `superstruct` schemas for market insights payloads, including deep validation of `trends`/`sources` items and support for optional top-level `social` entries while allowing additional unknown API fields for forward compatibility ([#8006](https://github.com/MetaMask/core/pull/8006)).

## [0.1.0]

### Added

- Initial release ([#7693](https://github.com/MetaMask/core/pull/7693))
- Add `AiDigestController` for fetching and caching AI-generated asset digests ([#7746](https://github.com/MetaMask/core/pull/7746))
- Add Market Insights support to `AiDigestController` with `fetchMarketInsights` action ([#7930](https://github.com/MetaMask/core/pull/7930))
- Add `searchDigest` method to `AiDigestService` for calling the GET endpoint (currently mocked) ([#7930](https://github.com/MetaMask/core/pull/7930))

### Changed

- Validate `searchDigest` API responses and throw when the payload does not match the expected `MarketInsightsReport` shape.
- Normalize `searchDigest` responses from either direct report payloads or `digest` envelope payloads.

### Removed

- Remove legacy digest APIs and digest cache from `AiDigestController` and `AiDigestService`; only market insights APIs remain.
  - Removes `fetchDigest`, `clearDigest`, and `clearAllDigests` actions from the controller action surface.
  - Removes `DigestData`/`DigestEntry` types and the `digests` state branch.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/ai-controllers@0.1.0...HEAD
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/ai-controllers@0.1.0
