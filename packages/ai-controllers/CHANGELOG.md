# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Bump `@metamask/messenger` from `^1.0.0` to `^1.1.1` ([#8364](https://github.com/MetaMask/core/pull/8364), [#8373](https://github.com/MetaMask/core/pull/8373))
- Bump `@metamask/base-controller` from `^9.0.1` to `^9.1.0` ([#8457](https://github.com/MetaMask/core/pull/8457))

## [0.6.3]

### Fixed

- `RelatedAsset.caip19` is now optional (`string[] | undefined`) to match the live API, which omits the field for perps-only synthetic assets (e.g. ETHFI). `AiDigestService.fetchMarketOverview` normalises absent `caip19` values to `[]` so consumers always receive a `string[]` ([#8326](https://github.com/MetaMask/core/pull/8326)).

## [0.6.2]

### Changed

- Bump `@metamask/base-controller` from `^9.0.0` to `^9.0.1` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/messenger` from `^0.3.0` to `^1.0.0` ([#8317](https://github.com/MetaMask/core/pull/8317))

## [0.6.1]

### Changed

- `RelatedAsset.hlPerpsMarket` is now `string[]` (optional) instead of `string` to match the `/market-overview` API payload shape. `AiDigestService.fetchMarketOverview` now validates `hlPerpsMarket` as an array of strings and rejects string values ([#8308](https://github.com/MetaMask/core/pull/8308)).

## [0.6.0]

### Added

- `MarketInsightsReport` now includes a required `digestId` field containing the unique UUID returned in the `/asset-summary` API response envelope ([#8283](https://github.com/MetaMask/core/pull/8283)).
- `AiDigestService` now requires the `{ id, digest }` / `{ id, report }` envelope shape and exposes `id` as `digestId` on the returned report objects; bare (non-enveloped) responses are no longer accepted ([#8283](https://github.com/MetaMask/core/pull/8283)).

## [0.5.0]

### Changed

- `AiDigestService.searchDigest` now uses the universal `asset` query parameter instead of the previous `caipAssetType` / `hlPerpsMarket` branching logic. The public TypeScript API is unchanged; any identifier (CAIP-19, ticker, name, perps market id) can be passed as before ([#8263](https://github.com/MetaMask/core/pull/8263)).
- `RelatedAsset.hlPerpsMarket` now covers all HyperLiquid market identifiers — both regular crypto tokens (`BTC`, `ETH`) and purely synthetic perps assets (`xyz:TSLA`). No separate field is needed; clients use `caip19` presence to decide the icon resolution strategy ([#8263](https://github.com/MetaMask/core/pull/8263)).

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/ai-controllers@0.6.3...HEAD
[0.6.3]: https://github.com/MetaMask/core/compare/@metamask/ai-controllers@0.6.2...@metamask/ai-controllers@0.6.3
[0.6.2]: https://github.com/MetaMask/core/compare/@metamask/ai-controllers@0.6.1...@metamask/ai-controllers@0.6.2
[0.6.1]: https://github.com/MetaMask/core/compare/@metamask/ai-controllers@0.6.0...@metamask/ai-controllers@0.6.1
[0.6.0]: https://github.com/MetaMask/core/compare/@metamask/ai-controllers@0.5.0...@metamask/ai-controllers@0.6.0
[0.5.0]: https://github.com/MetaMask/core/compare/@metamask/ai-controllers@0.4.0...@metamask/ai-controllers@0.5.0
[0.4.0]: https://github.com/MetaMask/core/compare/@metamask/ai-controllers@0.3.0...@metamask/ai-controllers@0.4.0
[0.3.0]: https://github.com/MetaMask/core/compare/@metamask/ai-controllers@0.2.0...@metamask/ai-controllers@0.3.0
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/ai-controllers@0.1.0...@metamask/ai-controllers@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/ai-controllers@0.1.0
