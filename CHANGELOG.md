# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [30.1.0]
### Added
- Allow clients to avoid third party tokenlist polling ([#861](https://github.com/MetaMask/controllers/pull/861)):
  - Added a new configuration property `preventPollingOnNetworkRestart` is added to TokenListController.
  - Added a method to update the new preventPollingOnNetworkRestart property value.
  - Added a method to reset the `tokenList` and `tokensChainsCache` properties in state. 

## [30.0.2]
### Added
- Adds method `isTokenListSupportedForNetwork` which returns `SupportedTokenDetectionNetworks` plus the local ganache network chainId. Then changes TokenListController to use this method to check whether or not to start polling, so that polling can occur on ganache networks to allow for e2e testing ([#855](https://github.com/MetaMask/controllers/pull/855))

## [30.0.1]
### Fixed
- Change `formatIconUrlWithProxy` to accept hex strings for `chainId` ([#851](https://github.com/MetaMask/controllers/pull/851))
 - This change fixes an issue introduced in v30.0.0 for metamask-extension where the `chainId` is currently represented as a hexadecimal in the TokensController and was, as a result, getting invalid URL responses from `formatIconUrlWithProxy` which previously expected its `chainId` argument to be in decimal format.

## [30.0.0]
### Added
- **BREAKING:** Introduce `getNetworkState`, `getPreferencesState`, and `onTokenListStateChange` to the TokenDetectionController constructor options object ([#808](https://github.com/MetaMask/controllers/pull/808))
  - `getPreferencesState` provides the default value for `useTokenDetection` from the PreferencesController state.
  - `getNetworkState` provides the default value for `chainId` from the NetworkController state.
  - `onTokenListStateChange` listener triggers a detect action whenever the TokenListController finishes fetching a token list.
- **BREAKING:** Update AssetsContractController to keep track of the current network (accessible via config.chainId) as well as whether the network supports token detection ([#809](https://github.com/MetaMask/controllers/pull/809))
  - Consumers will need to pass listener method `onNetworkStateChange` in AssetsContractController constructor options object. This method should be called with network/provider details when network changes occur.
- Add `onCollectibleAdded` event handler to the CollectiblesController constructor ([#814](https://github.com/MetaMask/controllers/pull/814))
  - This event handler was added to allow us to capture metrics.

### Changed
- **BREAKING:** Rename `addTokens` on the TokenDetectionController constructor options object to `addDetectedTokens` ([#808](https://github.com/MetaMask/controllers/pull/808))
  - We are no longer automatically adding detected tokens to the wallet. This will provide users with the ability to manually import or ignore detected tokens.
- **BREAKING:** Rename `useStaticTokenList` to `useTokenDetection` on the PreferencesController constructor options object and set the value to be true by default ([#808](https://github.com/MetaMask/controllers/pull/808))
  - Token detection will now be enabled by default.
- **BREAKING:** Append phishfort blocklist to list used by PhishingController ([#715](https://github.com/MetaMask/controllers/pull/715))
  - The `test` method on `PhishingController` no longer returns a boolean, it now returns an object matching the `EthPhishingDetectResult` interface (defined in `PhishingController.ts`).
  - Designs may need to be updated to account for the fact that sites may now be blocked by Phishfort. We should ensure users are not directed to the `eth-phishing-detect` repository to dispute Phishfort blocks, because we will not be able to help them.
- **BREAKING:** Rename `convertPriceToDecimal` function name to `convertHexToDecimal` ([#808](https://github.com/MetaMask/controllers/pull/808))
- Rename `fetchFromDynamicTokenList` to `fetchTokenList` ([#806](https://github.com/MetaMask/controllers/pull/806))
  - No need to mention dynamic in the naming since there is only one way to fetch the token list.
- Update `fetchFromCache` in TokenListController to return `TokenListMap | null` instead of `TokenListToken[] | null` ([#806](https://github.com/MetaMask/controllers/pull/806))
  - This allows us to remove some unnecessary mapping when working with cached tokens and token list.
- Update `TokenListToken` in TokenListController to include `aggregators` property ([#806](https://github.com/MetaMask/controllers/pull/806))
  - This allows us to show the aggregator names for a token.
- Update TokensController to support detected tokens ([#808](https://github.com/MetaMask/controllers/pull/808))
  - Introduce `detectedTokens` to the config object to track detected tokens, which is updated by calling `addDetectedTokens` whenever TokenDetectionController detects new tokens.
  - Added `fetchTokenMetadata` private method to fetch token metadata whenever adding individual tokens. This is currently used to populate aggregator information.
- Append `detectedTokens` to both TokenBalancesController & TokenRatesController `tokens` config object within their `onTokensStateChange` listener methods ([#808](https://github.com/MetaMask/controllers/pull/808))
  - This change ensures that we are populating both balances and rates for detected tokens.
- Update CollectibleDetectionController to place a proxy API (provided by Codefi) in front of OpenSea requests ([#805](https://github.com/MetaMask/controllers/pull/805))
  - All NFT related queries that were routed to OpenSea will now first route to a proxy server owened by Codefi. If this first request fails, and an OpenSea API key has been set, the query will re-route to OpenSea as a fallback.
- Update CurrencyRateController to use ETH exchange rate for preloaded testnets native currency (Rinkeby, Ropsten, Goerli, Kovan) ([#816](https://github.com/MetaMask/controllers/pull/816))
- Update ERC721Standard to query for name and symbol values on ERC721 contracts even when the contract does not support the metadata interface ([#834](https://github.com/MetaMask/controllers/pull/834))
- Increase polling interval for TokenListController and require minimum of 3 occurrences across our aggregated public token lists for use in the dynamic token list ([#836](https://github.com/MetaMask/controllers/pull/836))

### Removed
- **BREAKING:** Remove `removeAndIgnoreToken` from TokensController ([#808](https://github.com/MetaMask/controllers/pull/808))
  - The logic for removing token(s) is now consolidated in a new method named `ignoredTokens`. Consumers will need to update instances of `removeAndIgnoreToken` to use `ignoredTokens` instead.
- **BREAKING:** Remove `onTokensStateChange` from the TokenDetectionController constructor options object ([#808](https://github.com/MetaMask/controllers/pull/808))
  - This was previously used to update the `tokens` property in the controller's configuration object. This is not needed since those tokens are managed by the TokensController.
- **BREAKING:** Remove `useStaticTokenList` and `onPreferencesStateChange` from TokenListController constructor options object ([#806](https://github.com/MetaMask/controllers/pull/806))
  - `useStaticTokenList` was previously used to determined if this controller fetched against a static vs dynamic token list and `onPreferencesStateChange` was used to update `useStaticTokenList`.
  - The controller now always fetches from a dynamic token list.
- **BREAKING:** Remove snap-specific network-access endowment ([#820](https://github.com/MetaMask/controllers/pull/820))
  - Consumers who still require this endowment should import from `@metamask/snap-controllers` minimum version 0.13.0.

### Fixed
- Update AssetsContractController to fix issues parsing non-standard ERC-20 responses ([#830](https://github.com/MetaMask/controllers/pull/830))
 - Now correctly reads token contract values for decimals and symbol with solidity return type `bytes32`.

## [29.0.1]
### Added
- Add SupportedTokenDetectionNetworks enum and util for token detection support. ([#811](https://github.com/MetaMask/controllers/pull/811))

### Fixed
- Fix bug introduced in v29.0.0 where `createNewVaultAndRestore` would crash with a validation failure. ([#819](https://github.com/MetaMask/controllers/pull/819))


## [29.0.0]
### Added
- Reintroduce NotificationController for in-app notifications ([#709](https://github.com/MetaMask/controllers/pull/709))
- Add optional token service timeout parameter([#793](https://github.com/MetaMask/controllers/pull/793))

### Changed
- **BREAKING**: Bump eth-keyring-controller to 7.0.1 ([#802](https://github.com/MetaMask/controllers/pull/802))
  - Mnemonics in keyrings of type `HD Key Tree` are always serialized as arrays of numbers. `exportSeedPhrase` now returns a buffer rather than a string, consumers will need to adapt to this new return type accordingly.

## [28.0.0]
### Added
- Add GrantPermissions action to PermissionsController ([#780](https://github.com/MetaMask/controllers/pull/780))
- Add `PermissionController.revokePermissionForAllSubjects` action ([#764](https://github.com/MetaMask/controllers/pull/764))

### Changed
- **BREAKING:** Rename NotificationController to AnnouncementController ([#697](https://github.com/MetaMask/controllers/pull/697))
  - The `NotificationController` class is now `AnnouncementController`.
  - The controller `notifications` state has been renamed to `announcements`.
  - All other exported types including the word "notification" have been updated to use the word "announcement" instead.

## [27.1.1]
### Fixed
- Move `@keystonehq/metamask-airgapped-keyring` to dependencies ([#757](https://github.com/MetaMask/controllers/pull/757))

## [27.1.0] [DEPRECATED]
### Added
- Now the `KeyringController` supports the `QRKeyring` from `@keystonehq/metamask-airgapped-keyring`. Developers can enable the import of accounts from a QR hardware wallet. A new optional parameter, `setAccountLabel` from the `PreferencesController`, should be passed to the `KeyringController` to enable this new functionality. ([#685](https://github.com/MetaMask/controllers/pull/685))
  - **UPDATE:** This is broken. Consumers are encouraged to upgrade to [27.1.1].

### Changed
- Bump `eth-phishing-detect` version from 1.1.14 to 1.1.16 ([#742](https://github.com/MetaMask/controllers/pull/742))
- Bump `@metamask/contract-metadata` from 1.31.0 to 1.33.0 ([#730](https://github.com/MetaMask/controllers/pull/730))

### Fixed
- Improve error message when attempting to import an invalid private key ([#739](https://github.com/MetaMask/controllers/pull/739))

## [27.0.0]
### Changed
- **BREAKING:** Further reduce load on Infura by removing non-critical data from the fallback implementation of the Gas API ([#712](https://github.com/MetaMask/controllers/pull/712))
  - In GasFeeEstimates – the type of the object returned by `fetchGasEstimatesViaEthFeeHistory` as well as type of `gasFeeEstimates` stored in GasFeeController — `historicalBaseFeeRange`, `baseFeeTrend`, `latestPriorityFeeRange`, `historicalPriorityFeeRange`, `priorityFeeTrend`, and `networkCongestion` can now be null. You should update your code to account for this.
  - The ExistingFeeHistoryBlock and NextFeeHistoryBlock types were inconvenient to use and are no longer public. You should use FeeHistoryBlock instead.
  - The BlockFeeHistoryDatasetFetcher class has been removed. There is no replacement.
  - The `calculateBaseFeeRange`, `calculateBaseFeeTrend`, `calculateNetworkCongestion`, `calculatePriorityFeeRange`, and `calculatePriorityFeeTrend` functions have been removed. There are no replacements.
- Update AssetsContractController to make `userAddress` of `getTokenStandardAndDetails` optional ([#717](https://github.com/MetaMask/controllers/pull/717))

### Fixed
- Fix RateLimitController so that the rate limit is not reset aggressively ([#716](https://github.com/MetaMask/controllers/pull/716))

## [26.0.0]
### Added
- Add PermissionController and SubjectMetadataController ([#692](https://github.com/MetaMask/controllers/pull/692))
- Add RateLimitController ([#698](https://github.com/MetaMask/controllers/pull/698))
- Add `revokePermissions` to PermissionController actions ([#708](https://github.com/MetaMask/controllers/pull/708))

### Changed
- **BREAKING:** Fetch and return token image as part of `getDetails` calls on ERC721Standard and ERC1155Standard ([#702](https://github.com/MetaMask/controllers/pull/702))
  - This change is breaking because it requires that the AssetsContractController (on which the ERC721Standard and ERC1155Standard are instantiated) be passed a listener for onPreferencesStateChange from the PreferencesController so that it can use the user's preferred IPFSGateway to fetch any images hosted on IPFS. Consumers will have to pass onPreferencesStateChange in an options object (first arg) to the AssetsContractController constructor when initializing.
- Reduce load on Infura in gas estimate API fallback ([#705](https://github.com/MetaMask/controllers/pull/705))
- Update `fetchBlockFeeHistory` to account for nonexistent `baseFeePerGas` ([#703](https://github.com/MetaMask/controllers/pull/703))
- Update `fetchBlockFeeHistory` to account for test chains with a few number of blocks ([#699](https://github.com/MetaMask/controllers/pull/699))
- Expose `WebSocket` via endowments for network access ([#696](https://github.com/MetaMask/controllers/pull/696))
- Bump `@metamask/metamask-eth-abis` from ^2.1.0 to 3.0.0 ([#681](https://github.com/MetaMask/controllers/pull/681))

## [25.1.0]
### Changed
- Make the userAddress argument to the getDetails method on the ERC20Standard class optional. ([#674](https://github.com/MetaMask/controllers/pull/674))

## [25.0.0]
### Added
- Add optional third argument to method `checkAndUpdateSingleCollectibleOwnershipStatus` on CollectiblesController, which contains the userAddress and chainId to check asset ownership against. If not included, the method will still check against the currently configured selectedAddress and chainId configured in the CollectiblesController ([#672](https://github.com/MetaMask/controllers/pull/672))
- Add `getTokenStandardAndDetails` method on AssetsContractController which determines whether the input contract conforms to particular known token standard (`ERC20`, `ERC721` or `ERC1155`) and returns the detected standard along with some key values/details about that the contract and/or specified token within that contract ([#667](https://github.com/MetaMask/controllers/pull/667))

### Changed
- - **BREAKING** - Standardize ERC721/1155/20 method names ([#667](https://github.com/MetaMask/controllers/pull/667))
  - Renames many methods on the AssetsContractController to include the contract type they are used by in the name in a standardized structure (i.e. `getAssetName` -> `getERC721AssetName` and `balanceOfERC1155Collectible` ->  `getERC1155BalanceOf`).
  - Consumers will need to look at the AssetsContractController for any methods they consume and adapt names accordingly. 

## [24.0.0]
### Added
- Add `checkAndUpdateSingleCollectibleOwnershipStatus` method ([#669](https://github.com/MetaMask/controllers/pull/669))

### Changed
- - **BREAKING**:  Rename `checkAndUpdateCollectibleOwnershipStatus` to `checkAndUpdateAllCollectibleOwnershipStatus`  ([#669](https://github.com/MetaMask/controllers/pull/669))
  - Previously incorrectly released as minor version bump 23.1.0.
  - Consumers who used `checkAndUpdateCollectibleOwnershipStatus` must update it's name to `checkAndUpdateAllCollectibleOwnershipStatus`.

## [23.1.0] [DEPRECATED]
### Added
- Add checkAndUpdateSingleCollectibleOwnershipStatus method ([#669](https://github.com/MetaMask/controllers/pull/669))

## [23.0.0]
### Added
- Add method to check and update collectible ownership state ([#664](https://github.com/MetaMask/controllers/pull/664))
- Add method to set a collectible as favorite ([#623](https://github.com/MetaMask/controllers/pull/623))
- Update GasFeeController to use `eth_feeHistory` to compute gas fee recommendations when MetaSwap API is down ([#614](https://github.com/MetaMask/controllers/pull/614))
- Update GasFeeController to expose additional data sourced from the MetaSwap API in support of design updates to "edit gas fee" functionality in extension ([#632](https://github.com/MetaMask/controllers/pull/632)), ([#646](https://github.com/MetaMask/controllers/pull/646), [#660](https://github.com/MetaMask/controllers/pull/660))

### Changed
- **Breaking** Add caller-specified error for ApprovalController.clear ([#656](https://github.com/MetaMask/controllers/pull/656))
  - The new caller-specified error is mandatory. Consumers must add this error when calling the clear method for method to function properly. 

### Fixed
- Fix polling initialization for collectibles ([#662](https://github.com/MetaMask/controllers/pull/662))

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

[Unreleased]: https://github.com/MetaMask/controllers/compare/v30.1.0...HEAD
[30.1.0]: https://github.com/MetaMask/controllers/compare/v30.0.2...v30.1.0
[30.0.2]: https://github.com/MetaMask/controllers/compare/v30.0.1...v30.0.2
[30.0.1]: https://github.com/MetaMask/controllers/compare/v30.0.0...v30.0.1
[30.0.0]: https://github.com/MetaMask/controllers/compare/v29.0.1...v30.0.0
[29.0.1]: https://github.com/MetaMask/controllers/compare/v29.0.0...v29.0.1
[29.0.0]: https://github.com/MetaMask/controllers/compare/v28.0.0...v29.0.0
[28.0.0]: https://github.com/MetaMask/controllers/compare/v27.1.1...v28.0.0
[27.1.1]: https://github.com/MetaMask/controllers/compare/v27.1.0...v27.1.1
[27.1.0]: https://github.com/MetaMask/controllers/compare/v27.0.0...v27.1.0
[27.0.0]: https://github.com/MetaMask/controllers/compare/v26.0.0...v27.0.0
[26.0.0]: https://github.com/MetaMask/controllers/compare/v25.1.0...v26.0.0
[25.1.0]: https://github.com/MetaMask/controllers/compare/v25.0.0...v25.1.0
[25.0.0]: https://github.com/MetaMask/controllers/compare/v24.0.0...v25.0.0
[24.0.0]: https://github.com/MetaMask/controllers/compare/v23.1.0...v24.0.0
[23.1.0]: https://github.com/MetaMask/controllers/compare/v23.0.0...v23.1.0
[23.0.0]: https://github.com/MetaMask/controllers/compare/v22.0.0...v23.0.0
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
