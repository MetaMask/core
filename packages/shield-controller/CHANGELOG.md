# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Fixed and optimized shield-coverage-result polling with Cockatiel Policy from Controller-utils. ([#6847](https://github.com/MetaMask/core/pull/6847))

## [0.4.0]

### Added

- Added optional constructor params, `normalizeSignatureRequest` function which normalize the requests for TypedSignature similar to the security-alerts API. ([#6906](https://github.com/MetaMask/core/pull/6906))
- Added util function, `parseSignatureRequestMethod` to correctly parse the Json-Rpc method value for the signature request. ([#6906](https://github.com/MetaMask/core/pull/6906))

### Changed

- Bump `@metamask/base-controller` from `^8.4.1` to `^8.4.2` ([#6917](https://github.com/MetaMask/core/pull/6917))
- Bump `@metamask/transaction-controller` from `^60.7.0` to `^60.8.0` ([#6883](https://github.com/MetaMask/core/pull/6883))
- Updated internal MessagingSystem subscriber for TransactionController and SignatureController `stateChange` events. ([#6906](https://github.com/MetaMask/core/pull/6906))
  - Removed `personal_sign` check from the signature-coverage check. Now every signature requests will be sent to ruleset-engine.
  - Updated `TransactionMeta.SimulationData` check conditional to shallow comparison instead of referential comparison, to avoid triggering unnecessary coverage-check requests.
- Removed signature data validation from the internal `makeInitSignatureCoverageCheckBody` function. ([#6906](https://github.com/MetaMask/core/pull/6906))
  - As signature data is not always `string` (e.g. `eth_signTypedData` uses Array of Object) and the data is already validated in the SignatureController before adding to the state.

## [0.3.2]

### Changed

- Make start and stop idempotent ([#6817](https://github.com/MetaMask/core/pull/6817))

### Fixed

- Fixed incorrect endpoint for signature coverage result. ([#6821](https://github.com/MetaMask/core/pull/6821))

## [0.3.1]

### Changed

- Bump `@metamask/base-controller` from `^8.4.0` to `^8.4.1` ([#6807](https://github.com/MetaMask/core/pull/6807))

## [0.3.0]

### Added

- Log `not_shown` if result is not available ([#6667](https://github.com/MetaMask/core/pull/6667))
- Add `message` and `reasonCode` to coverage result type ([#6797](https://github.com/MetaMask/core/pull/6797))

### Changed

- Bump `@metamask/utils` from `^11.8.0` to `^11.8.1` ([#6708](https://github.com/MetaMask/core/pull/6708))
- **Breaking:** Change `checkCoverage` API to accept `coverageId` and skip `/init` if `coverageId` is provided ([#6792](https://github.com/MetaMask/core/pull/6792))

## [0.2.0]

### Added

- Add two new controller state metadata properties: `includeInStateLogs` and `usedInUi` ([#6504](https://github.com/MetaMask/core/pull/6504))
- Add signature coverage checking ([#6501](https://github.com/MetaMask/core/pull/6501))
- Add transaction and signature logging ([#6633](https://github.com/MetaMask/core/pull/6633))

### Changed

- Bump `@metamask/signature-controller` from `^33.0.0` to `^34.0.0` ([#6702](https://github.com/MetaMask/core/pull/6702))
- Bump `@metamask/base-controller` from `^8.2.0` to `^8.4.0` ([#6465](https://github.com/MetaMask/core/pull/6465), [#6632](https://github.com/MetaMask/core/pull/6632))
- Bump `@metamask/utils` from `^11.4.2` to `^11.8.0` ([#6588](https://github.com/MetaMask/core/pull/6588))

## [0.1.2]

### Fixed

- Fixed backend URL paths ([#6433](https://github.com/MetaMask/core/pull/6433))

## [0.1.1]

### Fixed

- Added missing exports and improved documentation ([#6412](https://github.com/MetaMask/core/pull/6412))

## [0.1.0]

### Added

- Initial release of the shield-controller package ([#6137](https://github.com/MetaMask/core/pull/6137)

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/shield-controller@0.4.0...HEAD
[0.4.0]: https://github.com/MetaMask/core/compare/@metamask/shield-controller@0.3.2...@metamask/shield-controller@0.4.0
[0.3.2]: https://github.com/MetaMask/core/compare/@metamask/shield-controller@0.3.1...@metamask/shield-controller@0.3.2
[0.3.1]: https://github.com/MetaMask/core/compare/@metamask/shield-controller@0.3.0...@metamask/shield-controller@0.3.1
[0.3.0]: https://github.com/MetaMask/core/compare/@metamask/shield-controller@0.2.0...@metamask/shield-controller@0.3.0
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/shield-controller@0.1.2...@metamask/shield-controller@0.2.0
[0.1.2]: https://github.com/MetaMask/core/compare/@metamask/shield-controller@0.1.1...@metamask/shield-controller@0.1.2
[0.1.1]: https://github.com/MetaMask/core/compare/@metamask/shield-controller@0.1.0...@metamask/shield-controller@0.1.1
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/shield-controller@0.1.0
