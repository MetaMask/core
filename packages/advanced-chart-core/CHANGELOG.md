# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0]

### Changed

- **BREAKING:** Rename the `SET_OHLCV_DATA` payload flag `atomicIntervalWindow` to `boundedIntervalWindow` ([#11762](https://github.com/MetaMask/core/pull/11762))
  - Hosts that set `atomicIntervalWindow` must send `boundedIntervalWindow` instead; the old name is no longer read

### Removed

- Remove the 5,000-bar cap on RN-backed backward pagination requests ([#11762](https://github.com/MetaMask/core/pull/11762))
  - It did not stop the coarse→fine interval-switch pagination storm, which is now prevented upstream (see Fixed)

### Fixed

- Fix a backward pagination storm when switching from a coarse to a fine interval (e.g. 1D → 1m) with `boundedIntervalWindow` enabled ([#11762](https://github.com/MetaMask/core/pull/11762))
  - The initial visible window is now applied once the chart is ready instead of being passed to the TradingView widget as its constructor `timeframe`, which TradingView kept and used to size later interval switches (e.g. ~46k one-minute bars for a one-month 1D window)
  - Consumers that do not set `boundedIntervalWindow`, and Social Leaderboard, keep the constructor `timeframe`
  - Interval switches no longer reset the time-scale right offset before `setResolution`, and the stale `setResolution` callback guard is restored

## [1.2.0]

### Added

- Add an opt-in `atomicIntervalWindow` flag to the `SET_OHLCV_DATA` payload that bounds the initial historical-data load when switching chart intervals ([#11625](https://github.com/MetaMask/core/pull/11625))
  - When enabled, the per-interval visible-range pin is clamped so it never frames an interval older than the bars already loaded, so the first data request is sized to the loaded window instead of inheriting the previous interval's wide range (which otherwise triggered a deep backward pagination request on coarse↔fine switches); scroll-back still loads older bars on demand
  - Off by default: consumers that do not set the flag keep today's unclamped framing
- Add a `hidePaneButtons` option to `ChartFeaturesConfig` that hides TradingView's per-pane toolbar (delete / maximize / move) via `widget.paneButtonsVisibility()` ([#11735](https://github.com/MetaMask/core/pull/11735))
  - On by default, so users can no longer remove indicator panes outside the host UI and leave host indicator state out of sync; set `hidePaneButtons: false` to restore TradingView's default pane buttons

## [1.1.2]

### Changed

- `createIframeHost` now accepts scheme-only entries in `allowedOrigins` (e.g. `moz-extension:`), matching any origin that uses that scheme ([#11572](https://github.com/MetaMask/core/pull/11572))
  - Firefox assigns each install a random `moz-extension://<uuid>` that cannot be pinned, so the scheme is allowlisted instead; exact origins (e.g. `chrome-extension://<id>`, `https://…`) continue to match exactly

## [1.1.1]

### Fixed

- Fix a second price scale appearing and a moving-average overlay rendering offset after switching chart type (e.g. line → candle) with a moving average enabled ([#11422](https://github.com/MetaMask/core/pull/11422))
  - The main series is no longer re-detached to a new right price scale when it is already on one

## [1.1.0]

### Added

- Add support for Node.js 26 ([#10981](https://github.com/MetaMask/core/pull/10981))

### Fixed

- Hide the price scale's auto-fit and logarithmic buttons, which were visible in desktop embedders ([#11368](https://github.com/MetaMask/core/pull/11368))

## [1.0.0]

### Added

- Initial release: platform-agnostic TradingView Advanced Charts WebView engine copied verbatim from `metamask-mobile`'s `AdvancedChart/webview/src` ([#9762](https://github.com/MetaMask/core/pull/9762), [#10521](https://github.com/MetaMask/core/pull/10521))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/advanced-chart-core@2.0.0...HEAD
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/advanced-chart-core@1.2.0...@metamask/advanced-chart-core@2.0.0
[1.2.0]: https://github.com/MetaMask/core/compare/@metamask/advanced-chart-core@1.1.2...@metamask/advanced-chart-core@1.2.0
[1.1.2]: https://github.com/MetaMask/core/compare/@metamask/advanced-chart-core@1.1.1...@metamask/advanced-chart-core@1.1.2
[1.1.1]: https://github.com/MetaMask/core/compare/@metamask/advanced-chart-core@1.1.0...@metamask/advanced-chart-core@1.1.1
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/advanced-chart-core@1.0.0...@metamask/advanced-chart-core@1.1.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/advanced-chart-core@1.0.0
