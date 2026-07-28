# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- refactor: add `.js` import extensions to Social AI packages ([#9623](https://github.com/MetaMask/core/pull/9623))

## [2.6.0]

### Added

- Add optional `marketCap` to the `Trade` type (and `TradeStruct`) — historical token market cap at trade time from the social API ([#9605](https://github.com/MetaMask/core/pull/9605))

## [2.5.0]

### Added

- Add `fetchFeed` method to `SocialService` (and the `SocialService:fetchFeed` messenger action) for the trader-activity feed. Calls `GET /feed` with an optional `scope` (`following`, default, personalized to the JWT-identified user; or `leaderboard`, the generic shared feed), `chains` (as CAIP-2 chain ids), `limit`, and cursor pagination (`olderThan`/`newerThan`) for infinite scroll ([#9447](https://github.com/MetaMask/core/pull/9447))
- Add `FeedItem`, `FeedPagination`, `FeedResponse`, and `FetchFeedOptions` types. `FeedItem` extends `Position` with the trade's `actor` (`ProfileSummary`) and creation `timestamp`; `FeedPagination` exposes the `olderCursor`/`newerCursor` cursors ([#9447](https://github.com/MetaMask/core/pull/9447))

### Changed

- Bump `@metamask/profile-sync-controller` from `^28.2.0` to `^28.3.0` ([#9463](https://github.com/MetaMask/core/pull/9463))
- Update `LICENSE` text ([#9472](https://github.com/MetaMask/core/pull/9472))

## [2.4.0]

### Added

- Add `optOutOfLeaderboard` and `optInToLeaderboard` methods to `SocialController` and `SocialService`, with corresponding messenger actions (`SocialController:optOutOfLeaderboard`, `SocialController:optInToLeaderboard`, `SocialService:optOutOfLeaderboard`, `SocialService:optInToLeaderboard`). These call `POST /leaderboard/opt-out` and `POST /leaderboard/opt-in` respectively (JWT-authed, `204 No Content` on success) ([#9354](https://github.com/MetaMask/core/pull/9354))

### Changed

- Bump `@metamask/controller-utils` from `^12.2.0` to `^12.3.0` ([#9218](https://github.com/MetaMask/core/pull/9218))
- Bump `@metamask/messenger` from `^1.2.0` to `^2.0.0` ([#9392](https://github.com/MetaMask/core/pull/9392))

## [2.3.1]

### Added

- Add optional 7-day per-chain fields to the `PerChainBreakdown` type (and `PerChainBreakdownStruct`): `perChainPnl7d` (`Record<string, number>`), `perChainRoi7d` (`Record<string, number | null>`), and `perChainVolume7d` (`Record<string, number>`) — exposing the 7-day Hyperliquid/per-chain breakdown alongside the existing 30-day fields. The unsuffixed fields (`perChainPnl`, `perChainRoi`, `perChainVolume`) remain the 30-day window; the new fields are optional for backward compatibility with social-api versions that only return the 30-day breakdown ([#9165](https://github.com/MetaMask/core/pull/9165))

## [2.3.0]

### Added

- Add optional perp fields to the `Trade` type (and `TradeStruct`): `classification` (`'spot' | 'perp' | 'send' | 'receive' | null`), `perpPositionType` (`'long' | 'short' | null`), and `perpLeverage` (`number | null`) — exposing Hyperliquid/perp trade metadata to consumers ([#9094](https://github.com/MetaMask/core/pull/9094))
- Add optional perp fields to the `Position` type (and `PositionStruct`): `perpPositionType` (`'long' | 'short' | null`), `perpLeverage` (`number | null`), and `positionAmountWithLeverage` (`number | null`) — exposing Hyperliquid/perp position metadata to consumers ([#9094](https://github.com/MetaMask/core/pull/9094))

### Changed

- Bump `@metamask/controller-utils` from `^12.0.0` to `^12.2.0` ([#8774](https://github.com/MetaMask/core/pull/8774), [#9058](https://github.com/MetaMask/core/pull/9058), [#9083](https://github.com/MetaMask/core/pull/9083))
- Bump `@metamask/profile-sync-controller` from `^28.0.2` to `^28.2.0` ([#8783](https://github.com/MetaMask/core/pull/8783), [#8912](https://github.com/MetaMask/core/pull/8912), [#9119](https://github.com/MetaMask/core/pull/9119))
- Bump `@metamask/base-data-service` from `^0.1.2` to `^0.1.3` ([#8799](https://github.com/MetaMask/core/pull/8799))

## [2.2.1]

### Changed

- Bump `@metamask/messenger` from `^1.1.1` to `^1.2.0` ([#8632](https://github.com/MetaMask/core/pull/8632))
- Bump `@metamask/base-data-service` from `^0.1.1` to `^0.1.2` ([#8755](https://github.com/MetaMask/core/pull/8755))
- Bump `@metamask/controller-utils` from `^11.20.0` to `^12.0.0` ([#8755](https://github.com/MetaMask/core/pull/8755))

## [2.2.0]

### Added

- Add `SocialService.fetchPositionById` method exposing `GET /v1/traders/position/:positionId`, returning a single `Position` by ID ([#8602](https://github.com/MetaMask/core/pull/8602))

## [2.1.0]

### Added

- Add `positionId` field to `Position` type and `PositionStruct` validation schema ([#8576](https://github.com/MetaMask/core/pull/8576))

## [2.0.0]

### Changed

- **BREAKING:** `SocialService.follow`, `SocialService.unfollow`, and `SocialController.followTrader`, `SocialController.unfollowTrader` no longer accept an `addressOrUid` option. The caller is identified server-side from the JWT `sub` claim carried in the `Authorization` header. ([#8520](https://github.com/MetaMask/core/pull/8520))
- **BREAKING:** `SocialService.fetchFollowing` and `SocialController.updateFollowing` now take no arguments (previously `{ addressOrUid }`). ([#8520](https://github.com/MetaMask/core/pull/8520))
- **BREAKING:** Remove `FetchFollowingOptions` type export (no longer needed). ([#8520](https://github.com/MetaMask/core/pull/8520))
- `SocialService` now calls `PUT /v1/users/me/follows`, `DELETE /v1/users/me/follows`, and `GET /v1/users/me/following` (previously `/v1/users/:addressOrUid/...`). ([#8520](https://github.com/MetaMask/core/pull/8520))

## [1.0.0]

### Changed

- **BREAKING:** `SocialServiceMessenger` now requires `AuthenticationController:getBearerToken` as an allowed action — all consumers must provide this action via messenger delegation
- All `SocialService` API requests now include a JWT bearer token in the `Authorization` header, obtained via `AuthenticationController:getBearerToken` ([#8485](https://github.com/MetaMask/core/pull/8485))

## [0.2.0]

### Added

- Add optional `tokenImageUrl` field to `Position` type and `PositionStruct` validation schema ([#8448](https://github.com/MetaMask/core/pull/8448))
- Add optional `medianHoldMinutes` field to `TraderStats` type and `TraderStatsStruct` validation schema ([#8448](https://github.com/MetaMask/core/pull/8448))
- Add `intent` and optional `category` fields to `Trade` type ([#8410](https://github.com/MetaMask/core/pull/8410))
- Export `TradeStruct` superstruct schema; derive `Trade` type via `Infer` ([#8410](https://github.com/MetaMask/core/pull/8410))
- Narrow `direction` to `'buy' | 'sell'` and `intent` to `'enter' | 'exit'` on `Trade` type ([#8410](https://github.com/MetaMask/core/pull/8410))
- Add `followingProfileIds` to `SocialControllerState` — stores Clicker profile IDs alongside existing `followingAddresses` ([#8459](https://github.com/MetaMask/core/pull/8459))

### Changed

- Bump `@metamask/messenger` from `^1.1.0` to `^1.1.1` ([#8373](https://github.com/MetaMask/core/pull/8373))
- Bump `@metamask/base-controller` from `^9.0.1` to `^9.1.0` ([#8457](https://github.com/MetaMask/core/pull/8457))

### Fixed

- Fix `fetchClosedPositions` using v2 URL instead of v1, which caused 404 errors since the closed positions endpoint only exists on v1 ([#8448](https://github.com/MetaMask/core/pull/8448))

## [0.1.0]

### Added

- Initial release ([#8321](https://github.com/MetaMask/core/pull/8321), [#8335](https://github.com/MetaMask/core/pull/8335), [#8337](https://github.com/MetaMask/core/pull/8337))
  - Add `SocialService` data service wrapping social-api endpoints with superstruct response validation
    - Add methods `fetchLeaderboard`, `fetchTraderProfile`, `fetchOpenPositions`, `fetchClosedPositions`, `fetchFollowers`, `fetchFollowing`, `follow`, `unfollow`
  - Add `SocialController` extending `BaseController` with messenger actions for state management
    - `updateLeaderboard` — fetches leaderboard and persists entries to state
    - `followTrader` — follows traders and updates following addresses in state
    - `unfollowTrader` — unfollows traders and removes addresses from state
    - `updateFollowing` — fetches following list and replaces addresses in state

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/social-controllers@2.6.0...HEAD
[2.6.0]: https://github.com/MetaMask/core/compare/@metamask/social-controllers@2.5.0...@metamask/social-controllers@2.6.0
[2.5.0]: https://github.com/MetaMask/core/compare/@metamask/social-controllers@2.4.0...@metamask/social-controllers@2.5.0
[2.4.0]: https://github.com/MetaMask/core/compare/@metamask/social-controllers@2.3.1...@metamask/social-controllers@2.4.0
[2.3.1]: https://github.com/MetaMask/core/compare/@metamask/social-controllers@2.3.0...@metamask/social-controllers@2.3.1
[2.3.0]: https://github.com/MetaMask/core/compare/@metamask/social-controllers@2.2.1...@metamask/social-controllers@2.3.0
[2.2.1]: https://github.com/MetaMask/core/compare/@metamask/social-controllers@2.2.0...@metamask/social-controllers@2.2.1
[2.2.0]: https://github.com/MetaMask/core/compare/@metamask/social-controllers@2.1.0...@metamask/social-controllers@2.2.0
[2.1.0]: https://github.com/MetaMask/core/compare/@metamask/social-controllers@2.0.0...@metamask/social-controllers@2.1.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/social-controllers@1.0.0...@metamask/social-controllers@2.0.0
[1.0.0]: https://github.com/MetaMask/core/compare/@metamask/social-controllers@0.2.0...@metamask/social-controllers@1.0.0
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/social-controllers@0.1.0...@metamask/social-controllers@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/social-controllers@0.1.0
