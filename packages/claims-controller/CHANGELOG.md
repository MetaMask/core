# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- Chore/w3a controllers linting ([#7455](https://github.com/MetaMask/core/pull/7455))
- chore: Update ESLint config packages to v15 ([#7305](https://github.com/MetaMask/core/pull/7305))
- Revert "Release 687.0.0" ([#7201](https://github.com/MetaMask/core/pull/7201))
- Release 687.0.0 ([#7190](https://github.com/MetaMask/core/pull/7190))
- chore: cleanup changelog uncategorized sections ([#7136](https://github.com/MetaMask/core/pull/7136))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/claims-controller@0.2.0...HEAD
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/claims-controller@0.1.0...@metamask/claims-controller@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/claims-controller@0.1.0
