# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/claims-controller@0.1.0...HEAD
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/claims-controller@0.1.0
