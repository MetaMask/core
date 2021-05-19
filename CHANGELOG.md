# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [8.0.0] - 2021-04-15
### Added
- Add restricted controller messenger ([#378](https://github.com/MetaMask/controllers/pull/378))

### Changed
- **BREAKING:** Update minimum Node.js version to v12 ([#441](https://github.com/MetaMask/controllers/pull/441))
- **BREAKING:** Replace controller context ([#387](https://github.com/MetaMask/controllers/pull/387))
- Bump @metamask/contract-metadata from 1.23.0 to 1.24.0 ([#440](https://github.com/MetaMask/controllers/pull/440))
- Update lint rules ([#442](https://github.com/MetaMask/controllers/pull/442), [#426](https://github.com/MetaMask/controllers/pull/426))

### Fixed
- Don't remove collectibles during auto detection ([#439](https://github.com/MetaMask/controllers/pull/439))

## [7.0.0] - 2021-04-06
### Added
- Ability to indicate if a transaction was added from the users local device and account creation time ([#436](https://github.com/MetaMask/controllers/pull/436))

### Changed
- **BREAKING:** Organize assets by chainid ([#435](https://github.com/MetaMask/controllers/pull/435))
- Support longer token symbols via wallet_watchAsset ([#433](https://github.com/MetaMask/controllers/pull/433))

## [6.2.1] - 2021-03-23
### Fixed
- Restore BN export ([#428](https://github.com/MetaMask/controllers/pull/428))

## [6.2.0] - 2021-03-23 [WITHDRAWN]
### Added
- Add the Notification Controller (to support "what's new" type announcements in-app) ([#329](https://github.com/MetaMask/controllers/pull/329))
- Add support for specifying a custom nonce ([#381](https://github.com/MetaMask/controllers/pull/381))

### Changed
- Explicitly add ethereumjs-tx as a package.json dependency ([#392](https://github.com/MetaMask/controllers/pull/392))
- Add `types` manifest field to package.json ([#391](https://github.com/MetaMask/controllers/pull/391))
- Use "options bag" for parameters for BaseControllerV2 constructor ([#388](https://github.com/MetaMask/controllers/pull/388))
- Ensure `uuid` dependency is type-checked ([#403](https://github.com/MetaMask/controllers/pull/403))
- Update TypeScript to v4.2 ([#369](https://github.com/MetaMask/controllers/pull/369))
- Asset metadata type conditionally requires error field, disallows for non-errors ([#395](https://github.com/MetaMask/controllers/pull/395))
- Improve TransactionMeta type: `status` now an enum, error conditional on status, default error added for failed etherscan transaction ([#406](https://github.com/MetaMask/controllers/pull/406))
- `NetworkController` no longer a required controller of `TypedMessageManager` ([#416](https://github.com/MetaMask/controllers/pull/416))
- Update `selectedAddress` when identities are updated in `PreferencesController.updateIdentities` ([#415](https://github.com/MetaMask/controllers/pull/415))
- Add contract address validation to `AssetsContractController.getCollectibleTokenURI` ([#414](https://github.com/MetaMask/controllers/pull/414))
- Add descriptive error messages to empty `toThrow` call ([#422](https://github.com/MetaMask/controllers/pull/422))

### Fixed
- Fix `signTransaction` transaction parameter type ([#400](https://github.com/MetaMask/controllers/pull/400))
- [BREAKING] Consistently use BN type for token balances ([#398](https://github.com/MetaMask/controllers/pull/398))

## [6.1.1] - 2021-03-12
### Added
- Add controller messaging system ([#377](https://github.com/MetaMask/controllers/pull/377))

### Fixed
- bugfix/dont modify current transactions ([#386](https://github.com/MetaMask/controllers/pull/386))
- Fix `format` commands ([#385](https://github.com/MetaMask/controllers/pull/385))

## [6.1.0] - 2021-03-10
### Added
- Add Base Controller v2 ([#358](https://github.com/MetaMask/controllers/pull/358))
- Add `babel-runtime` dependency required by `ethjs-query` ([#341](https://github.com/MetaMask/controllers/pull/341))
- Add Dependabot config ([#343](https://github.com/MetaMask/controllers/pull/343))

### Changed
- Add chainId to every transaction ([#349](https://github.com/MetaMask/controllers/pull/349))
- Add normalizeTokenTx for incoming transactions ([#380](https://github.com/MetaMask/controllers/pull/380))
- Bump elliptic from 6.5.3 to 6.5.4 ([#383](https://github.com/MetaMask/controllers/pull/383))
- Update prettier from v2.1.1 to v2.2.1 ([#376](https://github.com/MetaMask/controllers/pull/376))
- Remove AlethioTransactionMeta ([#374](https://github.com/MetaMask/controllers/pull/374))
- Improve JSON types ([#373](https://github.com/MetaMask/controllers/pull/373))
- Add BaseControllerV2 state metadata ([#371](https://github.com/MetaMask/controllers/pull/371))
- Update to TypeScript 4.1 ([#370](https://github.com/MetaMask/controllers/pull/370))
- Constrain BaseController state to be valid JSON ([#366](https://github.com/MetaMask/controllers/pull/366))
- Update ESLint config to v5 ([#368](https://github.com/MetaMask/controllers/pull/368))
- Use `unknown` rather than `any` for BaseController state ([#365](https://github.com/MetaMask/controllers/pull/365))
- BaseController send patches to state subscribers ([#363](https://github.com/MetaMask/controllers/pull/363))
- TransactionController gas and approve transaction improvements ([#350](https://github.com/MetaMask/controllers/pull/350))
- Extract CryptoCompare API to a separate module ([#353](https://github.com/MetaMask/controllers/pull/353))
- Move tests alongside code under test ([#354](https://github.com/MetaMask/controllers/pull/354))
- Bump @metamask/contract-metadata from 1.22.0 to 1.23.0 ([#357](https://github.com/MetaMask/controllers/pull/357))
- Remove Alethio to get incoming token transactions, using etherscan instead ([#351](https://github.com/MetaMask/controllers/pull/351))
- Prevent `ApprovalController` counting mismatch ([#356](https://github.com/MetaMask/controllers/pull/356))
- Update `sinon` and `@types/sinon` to latest versions ([#352](https://github.com/MetaMask/controllers/pull/352))
- Fix `tsconfig.json` indentation ([#355](https://github.com/MetaMask/controllers/pull/355))
- Replace `fetch-mock` with `nock` ([#340](https://github.com/MetaMask/controllers/pull/340))
- Update `ethereumjs-wallet` from v0.6.5 to v1.0.1 ([#347](https://github.com/MetaMask/controllers/pull/347))
- Update `@metamask/eslint-config` from v3 to v4.1.0 ([#344](https://github.com/MetaMask/controllers/pull/344))
- Update `uuid` from `v3.3.3` to `v8.3.2` ([#346](https://github.com/MetaMask/controllers/pull/346))
- Update approval controller test import ([#339](https://github.com/MetaMask/controllers/pull/339))
- Update `typedoc` ([#342](https://github.com/MetaMask/controllers/pull/342))
- Remove unused test module ([#338](https://github.com/MetaMask/controllers/pull/338))
- Replace `await-semaphore` with `async-mutex` ([#334](https://github.com/MetaMask/controllers/pull/334))
- Update `eth-json-rpc-filters` in lockfile ([#336](https://github.com/MetaMask/controllers/pull/336))

### Fixed
- Fix AbstractMessageManager error ([#367](https://github.com/MetaMask/controllers/pull/367))
- Enforce the usage of `chainId` instead of `networkId` in `NetworkController` ([#324](https://github.com/MetaMask/controllers/pull/324))

## [6.0.1] - 2021-02-05
### Changed
- Update `typedoc` from v0.15 to v20.20 ([#333](https://github.com/MetaMask/controllers/pull/333))
- Update `@metamask/contract-metadata` from v1.19 to v1.22 ([#332](https://github.com/MetaMask/controllers/pull/332))
- Bump node-notifier from 8.0.0 to 8.0.1 ([#323](https://github.com/MetaMask/controllers/pull/323))

### Fixed
- Add `safelyExecuteWithTimeout` for `accountTracker.refresh` ([#331](https://github.com/MetaMask/controllers/pull/331))
- Add try/catch for `assetsContract.getBalanceOf` ([#328](https://github.com/MetaMask/controllers/pull/328))

## [6.0.0] - 2021-01-19
### Changed
- Remove default approval controller type ([#321](https://github.com/MetaMask/controllers/pull/321))

### Fixed
- Enforce the usage of `chainId` instead of `networkId` in `NetworkController` ([#324](https://github.com/MetaMask/controllers/pull/324))

## [5.1.0] - 2020-12-02
### Changed
- Updated automatically detected assets ([#318](https://github.com/MetaMask/controllers/pull/318))

### Fixed
- Robustified `wallet_watchAssets` params validation, and improved errors ([#317](https://github.com/MetaMask/controllers/pull/317))

## [5.0.0] - 2020-11-19
### Added
- `ApprovalController` ([#309](https://github.com/MetaMask/controllers/pull/309))
  - Add user-defined default type
  - Add `Date.now()` timestamps to request (`approval.time`)
  - Enable `has` lookups by `type` only

### Changed
- **Breaking:** `ApprovalController`: Require types for all requests ([#309](https://github.com/MetaMask/controllers/pull/309))
- `ApprovalController`: Rename `ApprovalInfo` interface to `Approval` ([#309](https://github.com/MetaMask/controllers/pull/309))
- `PhishingController`: Make `no-cache` fetch option explicit ([#297](https://github.com/MetaMask/controllers/pull/297))
- Make package compatible with Node 12 ([#287](https://github.com/MetaMask/controllers/pull/287))

### Fixed
- `ApprovalController`: Fix faulty `origin` parameter type check ([#309](https://github.com/MetaMask/controllers/pull/309))
  - The type check was too loose, and would've permitted some invalid origins.

## [4.2.0] - 2020-11-13
### Added
- Expose `ApprovalController` count state ([#306](https://github.com/MetaMask/controllers/pull/306))
- `KeyringController` `onLock`/`onUnlock` event handlers ([#307](https://github.com/MetaMask/controllers/pull/307))

### Fixed
- Properly initialize `ApprovalController` ([#306](https://github.com/MetaMask/controllers/pull/306))

## [4.1.0] - 2020-11-10
### Added
- `ApprovalController` approval count methods ([#304](https://github.com/MetaMask/controllers/pull/304))

## [4.0.2] - 2020-11-09
### Changed
- Unpin `eth-sig-util` dependency ([#302](https://github.com/MetaMask/controllers/pull/302))

## [4.0.1] - 2020-11-09
### Fixed
- Fix `ApprovalController` export ([#300](https://github.com/MetaMask/controllers/pull/300))

## [4.0.0] - 2020-11-09
### Added
- Add `ApprovalController` ([#289](https://github.com/MetaMask/controllers/pull/289))

### Changed
- Allow configuring `CurrencyController` to always fetch USD rate ([#292](https://github.com/MetaMask/controllers/pull/292))

### Removed
- **BREAKING:** Remove `NetworkStatusController` ([#298](https://github.com/MetaMask/controllers/pull/298))

## [3.2.0] - 2020-10-21
### Added
- Add `addNewAccountWithoutUpdate` method ([#288](https://github.com/MetaMask/controllers/pull/288))

## [3.1.0] - 2020-09-23
### Changed
- Update various dependencies
  - eth-rpc-errors@3.0.0 ([#284](https://github.com/MetaMask/controllers/pull/284))
  - web3-provider-engine@16.0.1 ([#283](https://github.com/MetaMask/controllers/pull/283))
  - isomorphic-fetch@3.0.0 ([#282](https://github.com/MetaMask/controllers/pull/282))
  - eth-json-rpc-infura@5.1.0 ([#281](https://github.com/MetaMask/controllers/pull/281))

## [3.0.1] - 2020-09-15
### Changed
- Remove `If-None-Match` header from phishing config requests ([#277](https://github.com/MetaMask/controllers/pull/277))

## [3.0.0] - 2020-09-11
### Changed
- Use Infura v3 API ([#267](https://github.com/MetaMask/controllers/pull/267))

## [2.0.5] - 2020-08-18
### Changed
- Add prepublishOnly build script (#260)

## [2.0.4] - 2020-08-18
### Changed
- Use jsDelivr instead of the GitHub API for content (#256)
- Lower phishing config poll rate to 1 req/hr (#257)
- Use renamed `eth-rpc-error` package (#252)

## [2.0.3] - 2020-07-27
### Added
- TransactionsController: Bugfix cancel / speedup transactions (#248)

## [2.0.2] - 2020-07-14
### Added
- TransactionsController: Fetch incoming token transactions (#247)

## [2.0.1] - 2020-06-18
### Changed
- Update `PhishingController` endpoint to use GitHub API (#244)

## [2.0.0] - 2020-05-07
### Changed
- Rebrand as `@metamask/controllers` (#226)
- Use yarn & drop `npm-shrinkwrap.json` (#193)

## Removed
- Remove shapeshift controller (#209)

[Unreleased]: https://github.com/MetaMask/controllers/compare/v8.0.0...HEAD
[8.0.0]: https://github.com/MetaMask/controllers/compare/v7.0.0...v8.0.0
[7.0.0]: https://github.com/MetaMask/controllers/compare/v6.2.1...v7.0.0
[6.2.1]: https://github.com/MetaMask/controllers/compare/v6.2.0...v6.2.1
[6.2.0]: https://github.com/MetaMask/controllers/compare/v6.1.1...v6.2.0
[6.1.1]: https://github.com/MetaMask/controllers/compare/v6.1.0...v6.1.1
[6.1.0]: https://github.com/MetaMask/controllers/compare/v6.0.1...v6.1.0
[6.0.1]: https://github.com/MetaMask/controllers/compare/v6.0.0...v6.0.1
[6.0.0]: https://github.com/MetaMask/controllers/compare/v5.1.0...v6.0.0
[5.1.0]: https://github.com/MetaMask/controllers/compare/v5.0.0...v5.1.0
[5.0.0]: https://github.com/MetaMask/controllers/compare/v4.2.0...v5.0.0
[4.2.0]: https://github.com/MetaMask/controllers/compare/v4.1.0...v4.2.0
[4.1.0]: https://github.com/MetaMask/controllers/compare/v4.0.2...v4.1.0
[4.0.2]: https://github.com/MetaMask/controllers/compare/v4.0.1...v4.0.2
[4.0.1]: https://github.com/MetaMask/controllers/compare/v4.0.0...v4.0.1
[4.0.0]: https://github.com/MetaMask/controllers/compare/v3.2.0...v4.0.0
[3.2.0]: https://github.com/MetaMask/controllers/compare/v3.1.0...v3.2.0
[3.1.0]: https://github.com/MetaMask/controllers/compare/v3.0.1...v3.1.0
[3.0.1]: https://github.com/MetaMask/controllers/compare/v3.0.0...v3.0.1
[3.0.0]: https://github.com/MetaMask/controllers/compare/v2.0.5...v3.0.0
[2.0.5]: https://github.com/MetaMask/controllers/compare/v2.0.4...v2.0.5
[2.0.4]: https://github.com/MetaMask/controllers/compare/v2.0.3...v2.0.4
[2.0.3]: https://github.com/MetaMask/controllers/compare/v2.0.2...v2.0.3
[2.0.2]: https://github.com/MetaMask/controllers/compare/v2.0.1...v2.0.2
[2.0.1]: https://github.com/MetaMask/controllers/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/MetaMask/controllers/releases/tag/v2.0.0
