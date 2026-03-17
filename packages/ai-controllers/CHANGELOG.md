# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0]

### Added

- Export new `RelatedAsset` type representing a rich asset object returned in `MarketOverviewTrend.relatedAssets` ([#8218](https://github.com/MetaMask/core/pull/8218)).

### Changed

- `MarketOverviewTrend.relatedAssets` is now `RelatedAsset[]` instead of `string[]`. Each entry includes `name`, `symbol`, `caip19`, `sourceAssetId`, and optional `hlPerpsMarket` fields ([#8218](https://github.com/MetaMask/core/pull/8218)).
- `MarketOverview.headline`, `summary`, and `sources` have been removed; they are not part of the `/market-overview` API response ([#8218](https://github.com/MetaMask/core/pull/8218)).
- `MarketOverviewTrend.category` and `impact` are now optional to match the live API response shape ([#8218](https://github.com/MetaMask/core/pull/8218)).
- `AiDigestService.fetchMarketOverview` now accepts both flat `MarketOverview` and `{ report: MarketOverview }` enveloped responses, matching the live API shape ([#8218](https://github.com/MetaMask/core/pull/8218)).

## [0.3.0]

### Changed

- `AiDigestService.searchDigest` and `AiDigestController.fetchMarketInsights` now accept any string identifier rather than only CAIP-19 asset types. CAIP-19 identifiers continue to use the `caipAssetType` query parameter; all other strings (e.g. perps market symbols like `ETH`) use the new `hlPerpsMarket` query parameter ([#8182](https://github.com/MetaMask/core/pull/8182)).
- Rename `caip19Id` parameter to `assetIdentifier` in `DigestService.searchDigest`, `MarketInsightsEntry`, and `AiDigestController.fetchMarketInsights` ([#8182](https://github.com/MetaMask/core/pull/8182)).
- Replace `INVALID_CAIP_ASSET_TYPE` error message constant with `INVALID_ASSET_IDENTIFIER` in `AiDigestControllerErrorMessage` ([#8182](https://github.com/MetaMask/core/pull/8182)).

## [0.2.0]

### Added

- Add `fetchMarketOverview` method to `AiDigestService`, with superstruct validation of the `MarketOverview` response shape ([#8109](https://github.com/MetaMask/core/pull/8109)).
- Export new shared sub-types `Article`, `Tweet`, `Source`, `AIResponseMetadata`, `MarketOverview`, `MarketOverviewEntry`, `MarketOverviewTrend`, and `AiDigestControllerFetchMarketOverviewAction` ([#8109](https://github.com/MetaMask/core/pull/8109)).

### Changed

- Strengthen `AiDigestService` response validation using nested `superstruct` schemas for market insights payloads, including deep validation of `trends`/`sources` items and support for optional top-level `social` entries while allowing additional unknown API fields for forward compatibility ([#8006](https://github.com/MetaMask/core/pull/8006)).
- Rename shared sub-types `MarketInsightsArticle`, `MarketInsightsTweet`, and `MarketInsightsSource` to `Article`, `Tweet`, and `Source`; original names are kept as type aliases for backward compatibility ([#8109](https://github.com/MetaMask/core/pull/8109)).
- Tighten `MarketInsightsTrend.category` and `MarketInsightsTrend.impact` to closed string unions matching the API spec; `Source.type` is also now a closed union (`'news' | 'data' | 'social'`) ([#8109](https://github.com/MetaMask/core/pull/8109)).
- Update `searchDigest` endpoint from `/digests` to `/asset-summary` ([#8109](https://github.com/MetaMask/core/pull/8109)).
- Add optional `metadata` field to `MarketInsightsReport` ([#8109](https://github.com/MetaMask/core/pull/8109)).

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/ai-controllers@0.4.0...HEAD
[0.4.0]: https://github.com/MetaMask/core/compare/@metamask/ai-controllers@0.3.0...@metamask/ai-controllers@0.4.0
[0.3.0]: https://github.com/MetaMask/core/compare/@metamask/ai-controllers@0.2.0...@metamask/ai-controllers@0.3.0
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/ai-controllers@0.1.0...@metamask/ai-controllers@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/ai-controllers@0.1.0
