# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- chore: secure PUBLISH_PREVIEW_NPM_TOKEN with GitHub environment ([#8011](https://github.com/MetaMask/core/pull/8011))
- chore: Update `generate-method-action-types` script to be used in a single package ([#7983](https://github.com/MetaMask/core/pull/7983))

## [1.0.0]

### Added

- Initial release of `@metamask/client-controller` ([#7808](https://github.com/MetaMask/core/pull/7808))
  - `ClientController` for managing client (UI) open/closed state
  - `ClientController:setUiOpen` messenger action for platform code to call
  - `ClientController:stateChange` event for controllers to subscribe to lifecycle changes
  - `isUiOpen` state property (not persisted - always starts as `false`)
  - `clientControllerSelectors.selectIsUiOpen` selector for derived state access
  - Full TypeScript support with exported types

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/client-controller@1.0.0...HEAD
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/client-controller@1.0.0
