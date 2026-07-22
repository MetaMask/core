# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Bump `@metamask/transaction-controller` from `^69.0.0` to `^69.2.0` ([#9568](https://github.com/MetaMask/core/pull/9568), [#9589](https://github.com/MetaMask/core/pull/9589))

## [5.1.3]

### Changed

- Bump `@metamask/utils` from `^11.9.0` to `^11.11.0` ([#9074](https://github.com/MetaMask/core/pull/9074))
- Bump `@metamask/controller-utils` from `^12.0.0` to `^12.3.0` ([#8774](https://github.com/MetaMask/core/pull/8774), [#9058](https://github.com/MetaMask/core/pull/9058), [#9083](https://github.com/MetaMask/core/pull/9083), [#9218](https://github.com/MetaMask/core/pull/9218))
- Bump `@metamask/signature-controller` from `^39.2.1` to `^39.2.7` ([#8774](https://github.com/MetaMask/core/pull/8774), [#8912](https://github.com/MetaMask/core/pull/8912), [#8999](https://github.com/MetaMask/core/pull/8999), [#9058](https://github.com/MetaMask/core/pull/9058), [#9218](https://github.com/MetaMask/core/pull/9218), [#9349](https://github.com/MetaMask/core/pull/9349))
- Bump `@metamask/transaction-controller` from `^65.3.0` to `^69.0.0` ([#8796](https://github.com/MetaMask/core/pull/8796), [#8848](https://github.com/MetaMask/core/pull/8848), [#8999](https://github.com/MetaMask/core/pull/8999), [#9021](https://github.com/MetaMask/core/pull/9021), [#9027](https://github.com/MetaMask/core/pull/9027), [#9066](https://github.com/MetaMask/core/pull/9066), [#9089](https://github.com/MetaMask/core/pull/9089), [#9177](https://github.com/MetaMask/core/pull/9177), [#9203](https://github.com/MetaMask/core/pull/9203), [#9218](https://github.com/MetaMask/core/pull/9218), [#9253](https://github.com/MetaMask/core/pull/9253), [#9337](https://github.com/MetaMask/core/pull/9337), [#9349](https://github.com/MetaMask/core/pull/9349), [#9421](https://github.com/MetaMask/core/pull/9421), [#9456](https://github.com/MetaMask/core/pull/9456), [#9470](https://github.com/MetaMask/core/pull/9470))
- Bump `@metamask/messenger` from `^1.2.0` to `^2.0.0` ([#9392](https://github.com/MetaMask/core/pull/9392))

## [5.1.2]

### Changed

- Bump `@metamask/signature-controller` from `^39.1.2` to `^39.2.1` ([#8478](https://github.com/MetaMask/core/pull/8478), [#8755](https://github.com/MetaMask/core/pull/8755))
- Bump `@metamask/messenger` from `^1.0.0` to `^1.2.0` ([#8364](https://github.com/MetaMask/core/pull/8364), [#8373](https://github.com/MetaMask/core/pull/8373), [#8632](https://github.com/MetaMask/core/pull/8632))
- Bump `@metamask/transaction-controller` from `^64.0.0` to `^65.3.0` ([#8432](https://github.com/MetaMask/core/pull/8432), [#8447](https://github.com/MetaMask/core/pull/8447), [#8482](https://github.com/MetaMask/core/pull/8482), [#8585](https://github.com/MetaMask/core/pull/8585), [#8613](https://github.com/MetaMask/core/pull/8613), [#8691](https://github.com/MetaMask/core/pull/8691), [#8722](https://github.com/MetaMask/core/pull/8722), [#8755](https://github.com/MetaMask/core/pull/8755))
- Bump `@metamask/base-controller` from `^9.0.1` to `^9.1.0` ([#8457](https://github.com/MetaMask/core/pull/8457))
- Bump `@metamask/controller-utils` from `^11.20.0` to `^12.0.0` ([#8755](https://github.com/MetaMask/core/pull/8755))

## [5.1.1]

### Changed

- Bump `@metamask/transaction-controller` from `^63.3.1` to `^64.0.0` ([#8359](https://github.com/MetaMask/core/pull/8359))
- Bump `@metamask/signature-controller` from `^39.1.1` to `^39.1.2` ([#8325](https://github.com/MetaMask/core/pull/8325))
- Bump `@metamask/controller-utils` from `^11.19.0` to `^11.20.0` ([#8344](https://github.com/MetaMask/core/pull/8344))

## [5.1.0]

### Added

- Expose all public `ShieldController` methods through its messenger ([#8219](https://github.com/MetaMask/core/pull/8219))
  - The following actions are now available:
    - `ShieldController:start`
    - `ShieldController:stop`
    - `ShieldController:clearState`
    - `ShieldController:checkSignatureCoverage`
  - Corresponding action types are now exported (e.g. `ShieldControllerCheckCoverageAction`)

### Changed

- Bump `@metamask/base-controller` from `^9.0.0` to `^9.0.1` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/messenger` from `^0.3.0` to `^1.0.0` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/signature-controller` from `^39.1.0` to `^39.1.1` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/transaction-controller` from `^63.0.0` to `^63.3.1` ([#8272](https://github.com/MetaMask/core/pull/8272), [#8301](https://github.com/MetaMask/core/pull/8301), [#8313](https://github.com/MetaMask/core/pull/8313), [#8317](https://github.com/MetaMask/core/pull/8317))

## [5.0.2]

### Changed

- Bump `@metamask/transaction-controller` from `^62.12.0` to `^63.0.0` ([#7802](https://github.com/MetaMask/core/pull/7802), [#7832](https://github.com/MetaMask/core/pull/7832), [#7854](https://github.com/MetaMask/core/pull/7854), [#7872](https://github.com/MetaMask/core/pull/7872), [#7897](https://github.com/MetaMask/core/pull/7897), [#7996](https://github.com/MetaMask/core/pull/7996), [#8005](https://github.com/MetaMask/core/pull/8005), [#8031](https://github.com/MetaMask/core/pull/8031), [#8104](https://github.com/MetaMask/core/pull/8104), [#8140](https://github.com/MetaMask/core/pull/8140), [#8217](https://github.com/MetaMask/core/pull/8217), [#8225](https://github.com/MetaMask/core/pull/8225))
- Bump `@metamask/signature-controller` from `^39.0.1` to `^39.1.0` ([#7897](https://github.com/MetaMask/core/pull/7897), [#7946](https://github.com/MetaMask/core/pull/7946), [#7996](https://github.com/MetaMask/core/pull/7996), [#8140](https://github.com/MetaMask/core/pull/8140), [#8225](https://github.com/MetaMask/core/pull/8225))
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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/shield-controller@5.1.3...HEAD
[5.1.3]: https://github.com/MetaMask/core/compare/@metamask/shield-controller@5.1.2...@metamask/shield-controller@5.1.3
[5.1.2]: https://github.com/MetaMask/core/compare/@metamask/shield-controller@5.1.1...@metamask/shield-controller@5.1.2
[5.1.1]: https://github.com/MetaMask/core/compare/@metamask/shield-controller@5.1.0...@metamask/shield-controller@5.1.1
[5.1.0]: https://github.com/MetaMask/core/compare/@metamask/shield-controller@5.0.2...@metamask/shield-controller@5.1.0
[5.0.2]: https://github.com/MetaMask/core/compare/@metamask/shield-controller@5.0.1...@metamask/shield-controller@5.0.2
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
