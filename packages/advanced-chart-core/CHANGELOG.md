# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- `createIframeHost` now accepts scheme-only entries in `allowedOrigins` (e.g. `moz-extension:`), matching any origin that uses that scheme ([#11580](https://github.com/MetaMask/core/pull/11580))
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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/advanced-chart-core@1.1.1...HEAD
[1.1.1]: https://github.com/MetaMask/core/compare/@metamask/advanced-chart-core@1.1.0...@metamask/advanced-chart-core@1.1.1
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/advanced-chart-core@1.0.0...@metamask/advanced-chart-core@1.1.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/advanced-chart-core@1.0.0
