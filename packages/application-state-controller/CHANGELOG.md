# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release of `@metamask/application-state-controller` ([#7808](https://github.com/MetaMask/core/pull/7808))
  - `ApplicationStateController` for managing client (UI) open/closed state
  - `ApplicationStateController:setClientOpen` messenger action for platform code to call
  - `ApplicationStateController:stateChange` event for controllers to subscribe to lifecycle changes
  - `isClientOpen` state property (not persisted - always starts as `false`)
  - `selectIsClientOpen` selector for derived state access
  - Full TypeScript support with exported types

[Unreleased]: https://github.com/MetaMask/core/
