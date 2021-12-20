# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [22.1.0]
### Added
- Add method to check and update collectible ownership state ([#664](https://github.com/MetaMask/controllers/pull/664))
- Add finish to EIP-1559 v2 gas estimate code ([#660](https://github.com/MetaMask/controllers/pull/660))
- Add method to set a collectible as favorite ([#623](https://github.com/MetaMask/controllers/pull/623))
- Update GasFeeController to use `eth_feeHistory` to compute gas fee recommendations when MetaSwap API is down ([#614](https://github.com/MetaMask/controllers/pull/614))
- Update GasFeeController to expose additional data sourced from the MetaSwap API in support of design updates to "edit gas fee" functionality in extension ([#632](https://github.com/MetaMask/controllers/pull/632)), ([#646](https://github.com/MetaMask/controllers/pull/646))
- Add caller-specified error for ApprovalController.clear ([#656](https://github.com/MetaMask/controllers/pull/656))

### Fixed
- fix polling initialization for collectibles ([#662](https://github.com/MetaMask/controllers/pull/662))

## [22.0.0]
### Added
- **BREAKING**: Change IPFS URL generation to use subdomains and cidV1s over cidV0s, in order to enhance origin based security in our use of IPFS assets ([#655](https://github.com/MetaMask/controllers/pull/655))
 - Consumers using an IPFS gateway(s) which does not support IPFS subdomain formats will need to set the new config value 'useIPFSSubdomains' on CollectiblesController to false in order to have continued IPFS resolution support.

### Removed
- **BREAKING**: remove chainid normalization ([#651](https://github.com/MetaMask/controllers/pull/651))
   - This is breaking for anyone who adapted consumption of CollectiblesController to make use of v21.0.0. The chainId in the collectibles state shape is no longer normalized to decimal. 

### Fixed
- Fix collectibles collection images ([#650](https://github.com/MetaMask/controllers/pull/650))


## [21.0.1]
### Fixed
- Fix issue where chainId key in AllCollectibles & AllCollectibleContracts is formatted differently in manual collectible add and detection add flows. ([#648](https://github.com/MetaMask/controllers/pull/648))

## [21.0.0]
### Added
- **BREAKING**: Add openSeaEnabled preference ([#645](https://github.com/MetaMask/controllers/pull/645))
 - Consumers of the collectibleDetectionController and collectibleController who wish to continue use of OpenSea's API and AutoDetection will either need to configure openSeaEnabled to true after instantiating the controller now or expose a toggle for users to change the openSeaEnabled state in the preferences controller.

### Changed
- Change expected shape of OpenSea contract API to use collections ([#628](https://github.com/MetaMask/controllers/pull/628))
- Modify requirements for adding OpenSea detected contract ([#644](https://github.com/MetaMask/controllers/pull/644))

### Removed
- **BREAKING**: Add detection params (userAddress, chainId) and remove duplicate source of truth ([#636](https://github.com/MetaMask/controllers/pull/636))
 - Both collectibles and collectibleContracts are removed from CollectiblesController state.
  - Consumers who use these pieces of state will need to migrate to use the AllCollectibles and AllCollectiblesContracts state instead.

## [20.1.0]
### Added
- Add new method `addCollectibleVerifyOwnership` to CollectiblesController ([#635](https://github.com/MetaMask/controllers/pull/635))
- Add setting in PreferencesController to enable/disable collectible autoDetection and check against it in CollectibleDetectionController ([#638](https://github.com/MetaMask/controllers/pull/638))

### Changed
- Use user preferred ipfs gateway, as set in PreferencesController, to resolve ipfs based assets in CollectiblesController ([#637](https://github.com/MetaMask/controllers/pull/637))

## [20.0.0]
### Removed
- **BREAKING**: Remove polling start call in detection controllers' constructors ([#629](https://github.com/MetaMask/controllers/pull/629))
  - Consumers of either of the TokenDetection and CollectibleDetection controllers who wish to immediately start polling upon instantiation will need to call the start method on the controller immediately after instantiation.
- Remove ApprovalController.has signature overloads ([#624](https://github.com/MetaMask/controllers/pull/624))

## [19.0.0]
### Changed
- **BREAKING**: Split AssetsDetectionController into CollectiblesDetectionController and TokenDetectionController ([#619](https://github.com/MetaMask/controllers/pull/619))
  - Consumers of the AssetsDetectionController will have to now import both TokenDetectionController and CollectibleDetectionController and split up the calling of any methods accordingly.
- **BREAKING**: Set the `CurrencyRateController` property `conversionDate` to `null` if fetching the data fails. ([#621](https://github.com/MetaMask/controllers/pull/621))
  - Consumers of the `CurrencyRateController` will need to ensure their code anticipates that `conversionDate` will sometimes be set to `null`.

## [18.0.0]
### Added
- **BREAKING**: ERC1155 support ([#615](https://github.com/MetaMask/controllers/pull/615))
  -  `CollectiblesController` requires `getOwnerOf`, `balanceOfERC1155Collectible` and `uriERC1155Collectible` properties in the constructor which are methods from `AssetsContractController`.
- Add support for custom networks by querying the blockchain as default and add support for IPFS metadata URIs ([#616](https://github.com/MetaMask/controllers/pull/616))

### Changed
- Bump @metamask/contract-metadata from 1.29.0 to 1.30.0 ([#607](https://github.com/MetaMask/controllers/pull/607))

## [17.0.0]
### Added
- Add client id header to GasFeeController ([#597](https://github.com/MetaMask/controllers/pull/597))

### Changed
- Improve transaction state management for custom networks ([#598](https://github.com/MetaMask/controllers/pull/598))
- Make TokenRatesController support fiat conversion for more networks ([#585](https://github.com/MetaMask/controllers/pull/585))

### Removed
- **BREAKING:** Simplify type of BaseControllerV2 state ([#496](https://github.com/MetaMask/controllers/pull/496))
  - Controllers based upon BaseControllerV2 might need to update their types.
  - Custom interfaces/classes will no longer be allowed in the controller state. Simple objects only.

## [16.0.0]
### Changed
- Enable HTTP caching for the dynamic token list managed by the TokenListController ([#594](https://github.com/MetaMask/controllers/pull/594))

### Removed
- **BREAKING:** Remove `syncTokens` method from the TokenListController ([#590](https://github.com/MetaMask/controllers/pull/590))

### Fixed
- Fix bug that allowed `getGasFeeEstimatesAndStartPolling` to initiate multiple simultaneous fetch requests ([#586](https://github.com/MetaMask/controllers/pull/586))
- Fix bug that cause an invalid tokenList to be in controller state when active network is not supported by our tokenList API ([#588](https://github.com/MetaMask/controllers/pull/588))

## [15.1.0]
### Changed
- Improve transaction state management ([#582](https://github.com/MetaMask/controllers/pull/582))
  - TransactionController improvement to reconcile the data between local and remote sources (Etherscan) and avoid misleading display of gas and/or status information.
- Bump immer from 8.0.1 to 9.0.6 ([#581](https://github.com/MetaMask/controllers/pull/581))

## [15.0.2]
### Fixed
- Change AbortController to default import ([#579](https://github.com/MetaMask/controllers/pull/579))
  - Fix error thrown when polyfilled AbortController is instantiated as a named import.

## [15.0.1]
### Fixed
- Add AbortController polyfill ([#575](https://github.com/MetaMask/controllers/pull/575))
  - [15.0.0](#1500) introduced the use of the global AbortController to this package. The global AbortController was first introduced in Node 15, so this unintentionally broke support for the minimum Node version this package should support, which is Node 12. By polyfilling the AbortController, we restore Node 12 support.

## [15.0.0]
### Changed
- **BREAKING:** Update TokensController allTokens state structure to make network/chainID parent of account ([#572](https://github.com/MetaMask/controllers/pull/572))
  - The shape of allTokens state field on TokensController has been reorganized. Consumers of the TokensController will have to migrate existing token state to new shape.
- **BREAKING:** ignoredTokens changed to allIgnoredTokens ([#570](https://github.com/MetaMask/controllers/pull/570))
  - a new state field on the TokensController - allIgnoredTokens - now manages ignoredTokens by network and accountAddress, ignoredTokens is now the array of token address strings (previously an array of full token objects) that have been hidden by the user for the currently active network and accountAddress pair. Consumers of the TokensController will have to migrate existing ignoredTokens array to allIgnoredTokens object.
- **BREAKING:** Improve BaseControllerV2 messenger type ([#556](https://github.com/MetaMask/controllers/pull/556))
  - This is a breaking change, because anyone extending BaseControllerV2 will now be required to supply an additional generic parameter.
- **BREAKING:** Remove redundant default export from util.ts ([#574](https://github.com/MetaMask/controllers/pull/574))  
  - This is breaking for consumers who use the default import of the utils module, and will require using named imports instead.
- **BREAKING:** Removing aggregator from TokenListToken ([#564](https://github.com/MetaMask/controllers/pull/564))
  - This is breaking because the the DynamicToken and TokenListToken types no longer contain an aggregators field. Consumers will have to remove aggregators for objects using this type.
- **BREAKING:** Migrate ApprovalController to BaseControllerV2 ([#555](https://github.com/MetaMask/controllers/pull/555))
  - This is a breaking change because the BaseControllerV2 migration is breaking, and the 'resolve' method has been renamed to 'accept'.
- Speed up token detection for most popular 1000 tokens ([#568](https://github.com/MetaMask/controllers/pull/568))
- Cancel inflight request during chainId change and useStaticTokenList flag change ([#571](https://github.com/MetaMask/controllers/pull/571))
- Update the token list API host ([#563](https://github.com/MetaMask/controllers/pull/563))
- Bump @metamask/contract-metadata from 1.28.0 to 1.29.0 ([#569](https://github.com/MetaMask/controllers/pull/569))
- Reduce frequency of token list updates ([#561](https://github.com/MetaMask/controllers/pull/561))
  - Previously it would update the token list upon _any_ preference or network configuration change. Now it only restarts polling when the network switches or when the `useStaticTokenList` flag changes. 

## [14.2.0]
### Added
- Added the ability to limit the number of transactions stored (default is 40) ([#550](https://github.com/MetaMask/controllers/pull/550))
- Added the ability to speedUp and stop based on provided gasValues from consumer ([#535](https://github.com/MetaMask/controllers/pull/535))
- Consolidate token list controller data.  ([#527](https://github.com/MetaMask/controllers/pull/527))
  - Adds 3 fields: `address`, `aggregators`, and `occurrences` to static tokens

## [14.1.0]
### Added
- Controller messenger selector subscriptions ([#551](https://github.com/MetaMask/controllers/pull/551))

## [14.0.2] - 2021-07-28
### Changed
- Fix `resetPolling` functionality ([#546](https://github.com/MetaMask/controllers/pull/546))
  - This fix addresses a bug that was discovered in `resetPolling` in `GasFeeController` functionality being called too frequently.
- Improve token list API error handling ([#541](https://github.com/MetaMask/controllers/pull/541))

## [14.0.1] - 2021-07-28 [DEPRECATED]
### Changed
- Ensure gas estimate fetching in gasFeeController correctly handles responses with invalid number of decimals ([#544](https://github.com/MetaMask/controllers/pull/544))
- Bump @metamask/contract-metadata from 1.27.0 to 1.28.0 ([#540](https://github.com/MetaMask/controllers/pull/540))

## [14.0.0] - 2021-07-27 [DEPRECATED]
### Added
- **BREAKING** Add EIP1559 support including `speedUpTransaction` and `stopTransaction` ([#521](https://github.com/MetaMask/controllers/pull/521))
  - The breaking change here is that consumers of this repo now have to check if the transaction object includes a gas price and fetch and add it themselves (if need be).

### Changed
- Make equality comparisons for token and collectible addresses in TokensController and CollectiblesController case insensitive  ([#537](https://github.com/MetaMask/controllers/pull/537))
- Reset gas fee estimate polling onNetworkStateChange in the gasFeeController ([#534](https://github.com/MetaMask/controllers/pull/534))

### Fixed
- Update AssetDetectionController to handle new fetch limits for the OpenSea collectibles api ([#536](https://github.com/MetaMask/controllers/pull/536))

## [13.2.0]
### Added
- Add options to GasFeeController fetchGasFeeEstimates ([#526](https://github.com/MetaMask/controllers/pull/526))

## [13.1.0]
### Added
- Add ERC721 detection to TokensController ([#524](https://github.com/MetaMask/controllers/pull/524)), ([#530](https://github.com/MetaMask/controllers/pull/530))

## [13.0.0] - 2021-07-12
### Changed
- **BREAKING:** Remove AssetsController and add CollectiblesController and TokensController in its place ([#518](https://github.com/MetaMask/controllers/pull/518))

## [12.1.0] - 2021-07-09
### Added
- Support for custom network and gas estimation ([#505](https://github.com/MetaMask/controllers/pull/505))
- A fallback for the token list API service based on user preference ([#517](https://github.com/MetaMask/controllers/pull/517))

## [12.0.0] - 2021-07-07
### Added
- Add GasFeeController to provide gas fee estimates [#494](https://github.com/MetaMask/controllers/pull/494)

### Changed
- **BREAKING:** Add chainId support to TokenRatesControllers [#476](https://github.com/MetaMask/controllers/pull/476)
  - The breaking change here is that TokenRatesController constructor now requires a onNetworkStateChange listener
- Add iconUrl to Token type in TokenListController [#512](https://github.com/MetaMask/controllers/pull/512)

## [11.0.0] - 2021-07-02
### Changed
- We accidentally shipped a breaking change in v10.2.0. The changelog has been updated to explain the breaking change, and it has been republished as v11.0.0.

## [10.2.0] - 2021-06-30 [DEPRECATED]
### Added
- **BREAKING:** Add TokenListController to fetch the token list from token services API ([#478](https://github.com/MetaMask/controllers/pull/478))
  - The breaking change here is that `AssetsDetectionController` now requires `getTokenListState` as a constructor parameter.
- Update `@ethereumjs-tx` to `@ethereumjs/tx` and add `@ethereumjs/common` to support EIP1559 compliant transactions ([#489](https://github.com/MetaMask/controllers/pull/489))

### Changed
- Bump @metamask/contract-metadata from 1.25.0 to 1.26.0 and 1.26.0 to 1.27.0 ([#492](https://github.com/MetaMask/controllers/pull/492),[#501](https://github.com/MetaMask/controllers/pull/501))

## [10.1.0] - 2021-06-07
### Added
- Export BaseControllerV2 Json type ([#482](https://github.com/MetaMask/controllers/pull/482))

### Changed
- Improve collectible detection by account ([#487](https://github.com/MetaMask/controllers/pull/487))
- Upgrade ethereumjs util ([#466](https://github.com/MetaMask/controllers/pull/466))

### Fixed
- Skip token detection for tokens that are already tracked ([#480](https://github.com/MetaMask/controllers/pull/480))

## [10.0.0]
### Fixed
- **BREAKING:** Fix stale conversionRate after switching network ([#465](https://github.com/MetaMask/controllers/pull/465))
  - The breaking change is the change in type of the `conversionRate` state of the `CurrencyRateController` - it's now nullable.

## [9.1.0] - 2021-05-20
### Added
- Add support for unicode domains to PhishingController ([#471](https://github.com/MetaMask/controllers/pull/471))

### Changed
- AssetsController collectibles metadata improvements ([#454](https://github.com/MetaMask/controllers/pull/454))

## [9.0.0]
### Added
- Add `getState` action to BaseControllerV2 ([#457](https://github.com/MetaMask/controllers/pull/457))

### Changed
- **BREAKING:** Migrate CurrencyRateController to BaseControllerV2 ([#372](https://github.com/MetaMask/controllers/pull/372))
- Add BaseControllerV2 support to ComposableController ([#447](https://github.com/MetaMask/controllers/pull/447))
- Update eth-keyring-controller ([#460](https://github.com/MetaMask/controllers/pull/460))
- Export BaseControllerV2 and ControllerMessenger ([#462](https://github.com/MetaMask/controllers/pull/462))
- Improve restricted messenger types for controllers ([#461](https://github.com/MetaMask/controllers/pull/461))
- Document all ControllerMessenger generic parameters ([#456](https://github.com/MetaMask/controllers/pull/456))
- Bump @metamask/contract-metadata from 1.24.0 to 1.25.0 ([#444](https://github.com/MetaMask/controllers/pull/444))

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

### Removed
- Remove shapeshift controller (#209)

[Unreleased]: https://github.com/MetaMask/controllers/compare/v22.1.0...HEAD
[22.1.0]: https://github.com/MetaMask/controllers/compare/v22.0.0...v22.1.0
[22.0.0]: https://github.com/MetaMask/controllers/compare/v21.0.1...v22.0.0
[21.0.1]: https://github.com/MetaMask/controllers/compare/v21.0.0...v21.0.1
[21.0.0]: https://github.com/MetaMask/controllers/compare/v20.1.0...v21.0.0
[20.1.0]: https://github.com/MetaMask/controllers/compare/v20.0.0...v20.1.0
[20.0.0]: https://github.com/MetaMask/controllers/compare/v19.0.0...v20.0.0
[19.0.0]: https://github.com/MetaMask/controllers/compare/v18.0.0...v19.0.0
[18.0.0]: https://github.com/MetaMask/controllers/compare/v17.0.0...v18.0.0
[17.0.0]: https://github.com/MetaMask/controllers/compare/v16.0.0...v17.0.0
[16.0.0]: https://github.com/MetaMask/controllers/compare/v15.1.0...v16.0.0
[15.1.0]: https://github.com/MetaMask/controllers/compare/v15.0.2...v15.1.0
[15.0.2]: https://github.com/MetaMask/controllers/compare/v15.0.1...v15.0.2
[15.0.1]: https://github.com/MetaMask/controllers/compare/v15.0.0...v15.0.1
[15.0.0]: https://github.com/MetaMask/controllers/compare/v14.2.0...v15.0.0
[14.2.0]: https://github.com/MetaMask/controllers/compare/v14.1.0...v14.2.0
[14.1.0]: https://github.com/MetaMask/controllers/compare/v14.0.2...v14.1.0
[14.0.2]: https://github.com/MetaMask/controllers/compare/v14.0.1...v14.0.2
[14.0.1]: https://github.com/MetaMask/controllers/compare/v14.0.0...v14.0.1
[14.0.0]: https://github.com/MetaMask/controllers/compare/v13.2.0...v14.0.0
[13.2.0]: https://github.com/MetaMask/controllers/compare/v13.1.0...v13.2.0
[13.1.0]: https://github.com/MetaMask/controllers/compare/v13.0.0...v13.1.0
[13.0.0]: https://github.com/MetaMask/controllers/compare/v12.1.0...v13.0.0
[12.1.0]: https://github.com/MetaMask/controllers/compare/v12.0.0...v12.1.0
[12.0.0]: https://github.com/MetaMask/controllers/compare/v11.0.0...v12.0.0
[11.0.0]: https://github.com/MetaMask/controllers/compare/v10.2.0...v11.0.0
[10.2.0]: https://github.com/MetaMask/controllers/compare/v10.1.0...v10.2.0
[10.1.0]: https://github.com/MetaMask/controllers/compare/v10.0.0...v10.1.0
[10.0.0]: https://github.com/MetaMask/controllers/compare/v9.1.0...v10.0.0
[9.1.0]: https://github.com/MetaMask/controllers/compare/v9.0.0...v9.1.0
[9.0.0]: https://github.com/MetaMask/controllers/compare/v8.0.0...v9.0.0
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
