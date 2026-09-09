# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0]

### Uncategorized

- chore: bump TypeScript from 5 to 7, and add TypeScript 6 side by side ([#9518](https://github.com/MetaMask/core/pull/9518))
- Preserve api-docs/ (not docs/) for Typedoc-generated directories ([#10114](https://github.com/MetaMask/core/pull/10114))
- chore: Enable lint:tsc for 11 additional clean packages ([#9664](https://github.com/MetaMask/core/pull/9664))
- refactor: add `.js` import extensions to Core Platform joint packages ([#9642](https://github.com/MetaMask/core/pull/9642))
- chore: migrate Jest from v29 to v30 ([#7905](https://github.com/MetaMask/core/pull/7905))
- Ensure refs in tsconfig files are synced with internal deps ([#8384](https://github.com/MetaMask/core/pull/8384))
- chore: Enable Oxfmt for generating method action types files ([#8498](https://github.com/MetaMask/core/pull/8498))
- chore: Format changelogs with Oxfmt ([#8442](https://github.com/MetaMask/core/pull/8442))
- Revert "Release 912.0.0 (#8451)" ([#8451](https://github.com/MetaMask/core/pull/8451))
- Release 912.0.0 ([#8451](https://github.com/MetaMask/core/pull/8451))
- chore: bump `@metamask/auto-changelog` to `^6.0.0` ([#8441](https://github.com/MetaMask/core/pull/8441))
- chore: Replace Prettier with Oxfmt ([#8434](https://github.com/MetaMask/core/pull/8434))
- feat: extract generate-action-types CLI into @metamask/messenger-cli ([#8378](https://github.com/MetaMask/core/pull/8378))
- feat(messenger): add `generate-action-types` CLI tool as subpath export ([#8264](https://github.com/MetaMask/core/pull/8264))

### Changed

- **BREAKING:** Drop CommonJS support ([#9536](https://github.com/MetaMask/core/pull/9536))
  - This package is now ESM-only, but can still be used in CommonJS projects via `require(esm)` in modern Node.js versions (22+), or dynamic imports in older Node.js versions.
- **BREAKING:** Bump minimum Node.js version to 22 ([#9976](https://github.com/MetaMask/core/pull/9976))
- **BREAKING:** Bump TypeScript target to ES2022 ([#10019](https://github.com/MetaMask/core/pull/10019))
  - This package now ships ES2022 code, requiring a compatible modern environment or bundler configuration to consume.
- Bump `@metamask/messenger` from `^1.0.0` to `^2.0.0` ([#8364](https://github.com/MetaMask/core/pull/8364), [#8373](https://github.com/MetaMask/core/pull/8373), [#8632](https://github.com/MetaMask/core/pull/8632), [#9392](https://github.com/MetaMask/core/pull/9392))
- Bump `@metamask/base-controller` from `^9.0.1` to `^9.1.0` ([#8457](https://github.com/MetaMask/core/pull/8457))

## [1.0.1]

### Changed

- Bump `@metamask/base-controller` from `^9.0.0` to `^9.0.1` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/messenger` from `^0.3.0` to `^1.0.0` ([#8317](https://github.com/MetaMask/core/pull/8317))

## [1.0.0]

### Added

- Initial release of `@metamask/client-controller` ([#7808](https://github.com/MetaMask/core/pull/7808))
  - `ClientController` for managing client (UI) open/closed state
  - `ClientController:setUiOpen` messenger action for platform code to call
  - `ClientController:stateChange` event for controllers to subscribe to lifecycle changes
  - `isUiOpen` state property (not persisted - always starts as `false`)
  - `clientControllerSelectors.selectIsUiOpen` selector for derived state access
  - Full TypeScript support with exported types

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/client-controller@2.0.0...HEAD
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/client-controller@1.0.1...@metamask/client-controller@2.0.0
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/client-controller@1.0.0...@metamask/client-controller@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/client-controller@1.0.0
