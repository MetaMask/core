# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0]

### Uncategorized

- chore: Format changelogs with Oxfmt ([#8442](https://github.com/MetaMask/core/pull/8442))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/social-controllers@1.0.0...HEAD
[1.0.0]: https://github.com/MetaMask/core/compare/@metamask/social-controllers@0.2.0...@metamask/social-controllers@1.0.0
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/social-controllers@0.1.0...@metamask/social-controllers@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/social-controllers@0.1.0
