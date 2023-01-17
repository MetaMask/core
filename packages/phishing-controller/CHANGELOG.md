# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.1]
### Uncategorized
- Rename this repository to `core` ([#1031](https://github.com/MetaMask/controllers/pull/1031))

## [1.1.0]
### Added
- Add method to conditionally update the phishing lists ([#986](https://github.com/MetaMask/core/pull/986))

### Changed
- Relax dependencies on `@metamask/base-controller` and `@metamask/controller-utils` (use `^` instead of `~`) ([#998](https://github.com/MetaMask/core/pull/998))
- Expose `lastFetched` in PhishingController state ([#986](https://github.com/MetaMask/core/pull/986))

## [1.0.0]
### Added
- Initial release
  - As a result of converting our shared controllers repo into a monorepo ([#831](https://github.com/MetaMask/core/pull/831)), we've created this package from select parts of [`@metamask/controllers` v33.0.0](https://github.com/MetaMask/core/tree/v33.0.0), namely:
    - `src/third-party/PhishingController.ts`
    - `src/third-party/PhishingController.test.ts`

    All changes listed after this point were applied to this package following the monorepo conversion.

[Unreleased]: https://github.com/MetaMask/controllers/compare/@metamask/phishing-controller@1.1.1...HEAD
[1.1.1]: https://github.com/MetaMask/controllers/compare/@metamask/phishing-controller@1.1.0...@metamask/phishing-controller@1.1.1
[1.1.0]: https://github.com/MetaMask/controllers/compare/@metamask/phishing-controller@1.0.0...@metamask/phishing-controller@1.1.0
[1.0.0]: https://github.com/MetaMask/controllers/releases/tag/@metamask/phishing-controller@1.0.0
