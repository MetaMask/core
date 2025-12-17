# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/claims-controller@0.3.1...HEAD
[0.3.1]: https://github.com/MetaMask/core/compare/@metamask/claims-controller@0.3.0...@metamask/claims-controller@0.3.1
[0.3.0]: https://github.com/MetaMask/core/compare/@metamask/claims-controller@0.2.0...@metamask/claims-controller@0.3.0
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/claims-controller@0.1.0...@metamask/claims-controller@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/claims-controller@0.1.0
