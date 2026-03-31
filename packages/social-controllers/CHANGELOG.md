# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release ([#8321](https://github.com/MetaMask/core/pull/8321), [#8335](https://github.com/MetaMask/core/pull/8335), [#8337](https://github.com/MetaMask/core/pull/8337))
  - Add `SocialService` data service wrapping social-api endpoints with superstruct response validation
    - Add methods `fetchLeaderboard`, `fetchTraderProfile`, `fetchOpenPositions`, `fetchClosedPositions`, `fetchFollowers`, `fetchFollowing`, `follow`, `unfollow`
  - Add `SocialController` extending `BaseController` with messenger actions for state management
    - `updateLeaderboard` — fetches leaderboard and persists entries to state
    - `followTrader` — follows traders and updates following addresses in state
    - `unfollowTrader` — unfollows traders and removes addresses from state
    - `updateFollowing` — fetches following list and replaces addresses in state

[Unreleased]: https://github.com/MetaMask/core/
