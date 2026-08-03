# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release: platform-agnostic TradingView Advanced Charts WebView engine copied verbatim from `metamask-mobile`'s `AdvancedChart/webview/src`

### Changed

- Conform the vendored WebView engine to the `core` monorepo lint conventions without altering its runtime behavior ([#9762](https://github.com/MetaMask/core/pull/9762))
  - Applies core naming, JSDoc, and code-quality rules in source, with narrowly-scoped rule allowances only for browser globals and external contract identifiers.

### Fixed

- Correct barrel imports that resolved to package directories so the compiled output loads the intended `index` modules ([#9762](https://github.com/MetaMask/core/pull/9762))

[Unreleased]: https://github.com/MetaMask/core/
