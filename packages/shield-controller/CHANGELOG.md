# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- chore: secure PUBLISH_PREVIEW_NPM_TOKEN with GitHub environment ([#8011](https://github.com/MetaMask/core/pull/8011))
- chore: upgrade `typedoc` from `^0.24.8` to `^0.25.13` ([#7898](https://github.com/MetaMask/core/pull/7898))
- chore: migrate Jest from v27 to v29 ([#7894](https://github.com/MetaMask/core/pull/7894))
- chore: upgrade Jest-related packages to latest 27.x versions ([#7792](https://github.com/MetaMask/core/pull/7792))

### Changed

- Bump `@metamask/transaction-controller` from `^62.12.0` to `^62.19.0` ([#7802](https://github.com/MetaMask/core/pull/7802), [#7832](https://github.com/MetaMask/core/pull/7832), [#7854](https://github.com/MetaMask/core/pull/7854), [#7872](https://github.com/MetaMask/core/pull/7872), [#7897](https://github.com/MetaMask/core/pull/7897), [#7996](https://github.com/MetaMask/core/pull/7996), [#8005](https://github.com/MetaMask/core/pull/8005), [#8031](https://github.com/MetaMask/core/pull/8031))
- Bump `@metamask/signature-controller` from `^39.0.1` to `^39.0.4` ([#7897](https://github.com/MetaMask/core/pull/7897), [#7946](https://github.com/MetaMask/core/pull/7946), [#7996](https://github.com/MetaMask/core/pull/7996))
- Bump `@metamask/controller-utils` from `^11.18.0` to `^11.19.0` ([#7995](https://github.com/MetaMask/core/pull/7995))

## [5.0.1]

### Added

- Added new public method, `clearState` to clear/reset the shield controller state. ([#7780](https://github.com/MetaMask/core/pull/7780))

### Changed

- Bump `@metamask/transaction-controller` from `^62.9.1` to `^62.12.0` ([#7642](https://github.com/MetaMask/core/pull/7642), [#7737](https://github.com/MetaMask/core/pull/7737), [#7760](https://github.com/MetaMask/core/pull/7760), [#7775](https://github.com/MetaMask/core/pull/7775))
- Bump `@metamask/signature-controller` from `^39.0.0` to `^39.0.1` ([#7642](https://github.com/MetaMask/core/pull/7642))

## [5.0.0]

### Changed

- Bump `@metamask/controller-utils` from `^11.17.0` to `^11.18.0` ([#7583](https://github.com/MetaMask/core/pull/7583))
- **BREAKING:** Bump `@metamask/signature-controller` from `^38.0.0` to `^39.0.0` ([#7604](https://github.com/MetaMask/core/pull/7604), [#7634](https://github.com/MetaMask/core/pull/7634))
  - When passing a signature request to `checkSignatureCoverage`, the `decodedPermission` property of the request has a different shape. See changelog for `@metamask/gator-permissions-controller` 1.0.0 for more.
- Bump `@metamask/transaction-controller` from `^62.7.0` to `^62.9.1` ([#7596](https://github.com/MetaMask/core/pull/7596), [#7602](https://github.com/MetaMask/core/pull/7602), [#7604](https://github.com/MetaMask/core/pull/7604))

## [4.1.0]

### Added

- Add optional constructor param, `captureException` to capture any errors during coverage API calls. ([#7555](https://github.com/MetaMask/core/pull/7555))

### Changed

- Upgrade `@metamask/utils` from `^11.8.1` to `^11.9.0` ([#7511](https://github.com/MetaMask/core/pull/7511))
- Bump `@metamask/transaction-controller` from `^62.5.0` to `^62.7.0` ([#7430](https://github.com/MetaMask/core/pull/7430), [#7494](https://github.com/MetaMask/core/pull/7494))
- Bump `@metamask/controller-utils` from `^11.16.0` to `^11.17.0` ([#7534](https://github.com/MetaMask/core/pull/7534))

## [4.0.0]

### Changed

- Bump `@metamask/signature-controller` from `^37.0.0` to `^38.0.0` ([#7330](https://github.com/MetaMask/core/pull/7330))
- Bump `@metamask/transaction-controller` from `^62.3.0` to `^62.5.0` ([#7257](https://github.com/MetaMask/core/pull/7257), [#7289](https://github.com/MetaMask/core/pull/7289), [#7325](https://github.com/MetaMask/core/pull/7325))

## [3.1.0]

### Added

- Added `AuthorizationList` in transaction init and log requests for 7702 transactions. ([#7246](https://github.com/MetaMask/core/pull/7246))

### Changed

- Move peer dependencies for controller and service packages to direct dependencies ([#7209](https://github.com/MetaMask/core/pull/7209), [#7220](https://github.com/MetaMask/core/pull/7220), [#7236](https://github.com/MetaMask/core/pull/7236))
  - The dependencies moved are:
    - `@metamask/signature-controller` (^37.0.0)
    - `@metamask/transaction-controller` (^62.3.0)
  - In clients, it is now possible for multiple versions of these packages to exist in the dependency tree.
    - For example, this scenario would be valid: a client relies on `@metamask/controller-a` 1.0.0 and `@metamask/controller-b` 1.0.0, and `@metamask/controller-b` depends on `@metamask/controller-a` 1.1.0.
  - Note, however, that the versions specified in the client's `package.json` always "win", and you are expected to keep them up to date so as not to break controller and service intercommunication.

## [3.0.0]

### Changed

- Bump `@metamask/controller-utils` from `^11.15.0` to `^11.16.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- **BREAKING:** Bump `@metamask/transaction-controller` from `^61.0.0` to `^62.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- **BREAKING:** Bump `@metamask/signature-controller` from `^36.0.0` to `^37.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))

## [2.1.1]

### Added

- Added `transactionMeta.rawTx` to the `logTransaction` request body. ([#7178](https://github.com/MetaMask/core/pull/7178))

### Changed

- Skipped transaction coverage check when the transaction is `submitted` or `confirmed`. ([#7178](https://github.com/MetaMask/core/pull/7178))

## [2.1.0]

### Added

- Added metrics in the Shield coverage response to track the latency ( [#7133](https://github.com/MetaMask/core/pull/7133))

## [2.0.0]

### Changed

- **BREAKING:** Bump `@metamask/signature-controller` from `^35.0.0` to `^36.0.0` ( [#4651](https://github.com/MetaMask/core/pull/4651))

## [1.2.0]

### Changed

- Bump `@metamask/transaction-controller` from `61.0.0` to `61.1.0`. ([#7007](https://github.com/MetaMask/core/pull/7007))
- Bump `@metamask/controller-utils` from `^11.14.1` to `^11.15.0`. ([#7003](https://github.com/MetaMask/core/pull/7003))

### Fixed

- Fixed and optimized initiating shield coverage result for transactions. ([#7036](https://github.com/MetaMask/core/pull/7036))

## [1.1.0]

### Fixed

- Fixed and optimized shield-coverage-result polling with Cockatiel Policy from Controller-utils. ([#6847](https://github.com/MetaMask/core/pull/6847))

## [1.0.0]

### Added

- Add new controller action `ShieldControllerGetStateAction` ([#6497](https://github.com/MetaMask/core/pull/6497))

### Changed

- **BREAKING:** Use new `Messenger` from `@metamask/messenger` ([#6497](https://github.com/MetaMask/core/pull/6497))
  - Previously, `ShieldController` accepted a `RestrictedMessenger` instance from `@metamask/base-controller`.
- **BREAKING:** Metadata property `anonymous` renamed to `includeInDebugSnapshot` ([#6497](https://github.com/MetaMask/core/pull/6497))
- **BREAKING:** Bump `@metamask/signature-controller` from `^34.0.0` to `^35.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))
- **BREAKING:** Bump `@metamask/transaction-controller` from `^60.0.0` to `^61.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))
- Bump `@metamask/base-controller` from `^8.4.2` to `^9.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/shield-controller@5.0.1...HEAD
[5.0.1]: https://github.com/MetaMask/core/compare/@metamask/shield-controller@5.0.0...@metamask/shield-controller@5.0.1
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/shield-controller@4.1.0...@metamask/shield-controller@5.0.0
[4.1.0]: https://github.com/MetaMask/core/compare/@metamask/shield-controller@4.0.0...@metamask/shield-controller@4.1.0
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/shield-controller@3.1.0...@metamask/shield-controller@4.0.0
[3.1.0]: https://github.com/MetaMask/core/compare/@metamask/shield-controller@3.0.0...@metamask/shield-controller@3.1.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/shield-controller@2.1.1...@metamask/shield-controller@3.0.0
[2.1.1]: https://github.com/MetaMask/core/compare/@metamask/shield-controller@2.1.0...@metamask/shield-controller@2.1.1
[2.1.0]: https://github.com/MetaMask/core/compare/@metamask/shield-controller@2.0.0...@metamask/shield-controller@2.1.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/shield-controller@1.2.0...@metamask/shield-controller@2.0.0
[1.2.0]: https://github.com/MetaMask/core/compare/@metamask/shield-controller@1.1.0...@metamask/shield-controller@1.2.0
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/shield-controller@1.0.0...@metamask/shield-controller@1.1.0
[1.0.0]: https://github.com/MetaMask/core/compare/@metamask/shield-controller@0.4.0...@metamask/shield-controller@1.0.0
[0.4.0]: https://github.com/MetaMask/core/compare/@metamask/shield-controller@0.3.2...@metamask/shield-controller@0.4.0
[0.3.2]: https://github.com/MetaMask/core/compare/@metamask/shield-controller@0.3.1...@metamask/shield-controller@0.3.2
[0.3.1]: https://github.com/MetaMask/core/compare/@metamask/shield-controller@0.3.0...@metamask/shield-controller@0.3.1
[0.3.0]: https://github.com/MetaMask/core/compare/@metamask/shield-controller@0.2.0...@metamask/shield-controller@0.3.0
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/shield-controller@0.1.2...@metamask/shield-controller@0.2.0
[0.1.2]: https://github.com/MetaMask/core/compare/@metamask/shield-controller@0.1.1...@metamask/shield-controller@0.1.2
[0.1.1]: https://github.com/MetaMask/core/compare/@metamask/shield-controller@0.1.0...@metamask/shield-controller@0.1.1
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/shield-controller@0.1.0
