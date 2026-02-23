# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Bump `@metamask/profile-sync-controller` from `^27.0.0` to `^27.1.0` ([#7849](https://github.com/MetaMask/core/pull/7849))
- Bump `@metamask/controller-utils` from `^11.18.0` to `^11.19.0` ([#7995](https://github.com/MetaMask/core/pull/7995))

## [0.4.2]

### Added

- Added new public method, `clearState` to clear/reset the claims controller state. ([#7780](https://github.com/MetaMask/core/pull/7780))

### Changed

- Bump `@metamask/controller-utils` from `^11.17.0` to `^11.18.0` ([#7583](https://github.com/MetaMask/core/pull/7583))

## [0.4.1]

### Changed

- Replaced global `console` logs with `ModuleLogger`. ([#7569](https://github.com/MetaMask/core/pull/7569))

## [0.4.0]

### Added

- Capture claims error and report to sentry using `Messenger.captureException` method from `@metamask/messenger`. ([#7553](https://github.com/MetaMask/core/pull/7553))

### Changed

- Upgrade `@metamask/utils` from `^11.8.1` to `^11.9.0` ([#7511](https://github.com/MetaMask/core/pull/7511))
- Bump `@metamask/controller-utils` from `^11.16.0` to `^11.17.0` ([#7534](https://github.com/MetaMask/core/pull/7534))

## [0.3.1]

### Added

- Added `updatedAt` field to the claims draft. ([#7523](https://github.com/MetaMask/core/pull/7523))

## [0.3.0]

### Added

- Added claims draft to controller and persist in the state as `drafts`. ([#7456](https://github.com/MetaMask/core/pull/7456))
- Added public methods (CRUD) with relate to the `ClaimDraft`. ([#7456](https://github.com/MetaMask/core/pull/7456))

### Changed

- Bump `@metamask/controller-utils` from `^11.15.0` to `^11.16.0` ([#7202](https://github.com/MetaMask/core/pull/7202))

## [0.2.0]

### Added

- Added new public method, `fetchClaimsConfigurations` to fetch the claims configuration from the Claims backend. ([#7109](https://github.com/MetaMask/core/pull/7109))
- Added new states fields, `claimsConfigurations` to the controller state. ([#7109](https://github.com/MetaMask/core/pull/7109))
  - `validSubmissionWindowDays` - number of days the claim is valid for submission.
  - `supportedNetworks` - supported networks for the claim submission.
- Exported `CreateClaimRequest` and `SubmitClaimConfig` types from the controller. ([#7109](https://github.com/MetaMask/core/pull/7109))

## [0.1.0]

### Added

- Added new `@metamask/claims-controller` package to handle shield subscription claims logics. ([#7072](https://github.com/MetaMask/core/pull/7072))
- Implementation of `ClaimsController`. ([#7072](https://github.com/MetaMask/core/pull/7072))
  - `getSubmitClaimConfig`: Generate configurations required for the claim submission.
  - `generateClaimSignature`: Generate signature for the claim submission.
- Implementation of Data-Service, `ClaimsService`. ([#7072](https://github.com/MetaMask/core/pull/7072))
  - `getClaims`: fetch list of users' claims from the backend.
  - `getClaimById`: fetch single claim by id.
  - `generateMessageForClaimSignature`: generate message to sign for the claim signature.
  - `verifyClaimSignature`: verify claim signature produced by user.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/claims-controller@0.4.2...HEAD
[0.4.2]: https://github.com/MetaMask/core/compare/@metamask/claims-controller@0.4.1...@metamask/claims-controller@0.4.2
[0.4.1]: https://github.com/MetaMask/core/compare/@metamask/claims-controller@0.4.0...@metamask/claims-controller@0.4.1
[0.4.0]: https://github.com/MetaMask/core/compare/@metamask/claims-controller@0.3.1...@metamask/claims-controller@0.4.0
[0.3.1]: https://github.com/MetaMask/core/compare/@metamask/claims-controller@0.3.0...@metamask/claims-controller@0.3.1
[0.3.0]: https://github.com/MetaMask/core/compare/@metamask/claims-controller@0.2.0...@metamask/claims-controller@0.3.0
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/claims-controller@0.1.0...@metamask/claims-controller@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/claims-controller@0.1.0
