# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- Revert "Release 912.0.0 (#8451)" ([#8451](https://github.com/MetaMask/core/pull/8451))
- Release 912.0.0 ([#8451](https://github.com/MetaMask/core/pull/8451))
- chore: bump `@metamask/auto-changelog` to `^6.0.0` ([#8441](https://github.com/MetaMask/core/pull/8441))
- chore: Replace Prettier with Oxfmt ([#8434](https://github.com/MetaMask/core/pull/8434))
- feat: extract generate-action-types CLI into @metamask/messenger-cli ([#8378](https://github.com/MetaMask/core/pull/8378))
- Release/899.0.0 ([#8369](https://github.com/MetaMask/core/pull/8369))
- feat(messenger): add `generate-action-types` CLI tool as subpath export ([#8264](https://github.com/MetaMask/core/pull/8264))

### Added

- Add `intent` and optional `category` fields to `Trade` type ([#8410](https://github.com/MetaMask/core/pull/8410))
- Export `TradeStruct` superstruct schema; derive `Trade` type via `Infer` ([#8410](https://github.com/MetaMask/core/pull/8410))
- Narrow `direction` to `'buy' | 'sell'` and `intent` to `'enter' | 'exit'` on `Trade` type ([#8410](https://github.com/MetaMask/core/pull/8410))

### Changed

- Bump `@metamask/messenger` from `^1.1.0` to `^1.1.1` ([#8373](https://github.com/MetaMask/core/pull/8373))
- Bump `@metamask/base-controller` from `^9.0.1` to `^9.1.0` ([#8457](https://github.com/MetaMask/core/pull/8457))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/social-controllers@0.1.0...HEAD
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/social-controllers@0.1.0
