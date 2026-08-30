/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { AssetsController } from './AssetsController.js';

export type AssetsControllerGetAssetsAction = {
  type: `AssetsController:getAssets`;
  handler: AssetsController['getAssets'];
};

export type AssetsControllerGetAssetsBalanceAction = {
  type: `AssetsController:getAssetsBalance`;
  handler: AssetsController['getAssetsBalance'];
};

export type AssetsControllerGetAssetMetadataAction = {
  type: `AssetsController:getAssetMetadata`;
  handler: AssetsController['getAssetMetadata'];
};

/**
 * Get a single combined asset (balance + metadata + price + computed
 * `fiatValue`) for an account directly from controller state.
 *
 * Reuses the same state-composition and filtering logic as `getAssets`
 * (balance and metadata are required, a missing price falls back to
 * `{ price: 0, lastUpdated: 0 }` with `fiatValue: 0`, and hidden or
 * otherwise filtered assets are excluded) so the returned shape never
 * drifts from `getAssets`. Reads from current state only and does not
 * trigger a data-source refresh.
 *
 * @param accountId - The account ID (`InternalAccount.id`, not an address).
 * @param assetId - The CAIP-19 asset ID including chain scope
 * (e.g. `eip155:1/erc20:0x...`).
 * @returns The combined `Asset`, or `undefined` when no complete
 * renderable asset (balance + metadata) exists for the account/asset pair.
 * @throws If `accountId` is empty or `assetId` is not a valid CAIP-19 asset ID.
 */
export type AssetsControllerGetAccountAssetByIDAction = {
  type: `AssetsController:getAccountAssetByID`;
  handler: AssetsController['getAccountAssetByID'];
};

/**
 * Get multiple combined assets (balance + metadata + price + computed
 * `fiatValue`) for an account directly from controller state.
 *
 * Applies the same state-composition and filtering rules as
 * `getAccountAssetByID` to each requested asset ID. Asset IDs that do not
 * resolve to a complete renderable asset (missing balance/metadata, hidden,
 * or otherwise filtered out) are omitted from the result. Reads from
 * current state only and does not trigger a data-source refresh.
 *
 * @param accountId - The account ID (`InternalAccount.id`, not an address).
 * @param assetIds - The CAIP-19 asset IDs including chain scope
 * (e.g. `eip155:1/erc20:0x...`).
 * @returns A record of combined `Asset`s keyed by normalized CAIP-19 asset
 * ID, containing only the requested assets that resolved.
 * @throws If `accountId` is empty or any `assetIds` entry is not a valid
 * CAIP-19 asset ID.
 */
export type AssetsControllerGetAccountAssetsByIDsAction = {
  type: `AssetsController:getAccountAssetsByIDs`;
  handler: AssetsController['getAccountAssetsByIDs'];
};

/**
 * Get all combined assets (balance + metadata + price + computed
 * `fiatValue`) an account holds on a given chain scope, directly from
 * controller state.
 *
 * Applies the same state-composition and filtering rules as
 * `getAccountAssetByID` (hidden or otherwise filtered assets are excluded).
 * Reads from current state only and does not trigger a data-source refresh.
 *
 * @param accountId - The account ID (`InternalAccount.id`, not an address).
 * @param scope - The CAIP-2 chain ID to filter by (e.g. `eip155:1`).
 * @returns A record of combined `Asset`s keyed by CAIP-19 asset ID,
 * containing only the account's assets on the given scope.
 * @throws If `accountId` is empty or `scope` is not a valid CAIP-2 chain ID.
 */
export type AssetsControllerGetAccountAssetsByScopeAction = {
  type: `AssetsController:getAccountAssetsByScope`;
  handler: AssetsController['getAccountAssetsByScope'];
};

export type AssetsControllerGetAssetsPriceAction = {
  type: `AssetsController:getAssetsPrice`;
  handler: AssetsController['getAssetsPrice'];
};

/**
 * Returns exchange rates in the format expected by the bridge controller
 * (conversionRates, currencyRates, marketData, currentCurrency) so that
 * when useAssetsControllerForRates is true the bridge can use a single
 * action instead of MultichainAssetsRatesController, TokenRatesController,
 * and CurrencyRateController.
 *
 * @returns Bridge-compatible exchange rate state derived from assetsPrice and selectedCurrency.
 */
export type AssetsControllerGetExchangeRatesForBridgeAction = {
  type: `AssetsController:getExchangeRatesForBridge`;
  handler: AssetsController['getExchangeRatesForBridge'];
};

/**
 * Returns state in the legacy format expected by transaction-pay-controller
 * (TokenBalancesController, AccountTrackerController, TokensController,
 * TokenRatesController, CurrencyRateController shapes) so that when
 * useAssetsController is true the transaction-pay-controller can use a
 * single action instead of five separate getState calls.
 *
 * @returns Legacy-compatible state for transaction-pay-controller.
 */
export type AssetsControllerGetStateForTransactionPayAction = {
  type: `AssetsController:getStateForTransactionPay`;
  handler: AssetsController['getStateForTransactionPay'];
};

/**
 * Add a custom asset for an account.
 * Custom assets are included in subscription and fetch operations.
 * Adding a custom asset also unhides it if it was previously hidden.
 *
 * When `pendingMetadata` is provided (e.g. from the extension's pending-tokens
 * flow), the token metadata is persisted immediately into `assetsInfo` so the
 * UI can render it without waiting for the next pipeline fetch.
 *
 * @param accountId - The account ID to add the custom asset for.
 * @param assetId - The CAIP-19 asset ID to add.
 * @param pendingMetadata - Optional token metadata from the UI (pendingTokens format).
 */
export type AssetsControllerAddCustomAssetAction = {
  type: `AssetsController:addCustomAsset`;
  handler: AssetsController['addCustomAsset'];
};

/**
 * Remove a custom asset from an account.
 *
 * @param accountId - The account ID to remove the custom asset from.
 * @param assetId - The CAIP-19 asset ID to remove.
 */
export type AssetsControllerRemoveCustomAssetAction = {
  type: `AssetsController:removeCustomAsset`;
  handler: AssetsController['removeCustomAsset'];
};

/**
 * Get all custom assets for an account.
 *
 * @param accountId - The account ID to get custom assets for.
 * @returns Array of CAIP-19 asset IDs for the account's custom assets.
 */
export type AssetsControllerGetCustomAssetsAction = {
  type: `AssetsController:getCustomAssets`;
  handler: AssetsController['getCustomAssets'];
};

/**
 * Hide an asset globally.
 * Hidden assets are excluded from the asset list returned by getAssets.
 * The hidden state is stored in assetPreferences.
 *
 * @param assetId - The CAIP-19 asset ID to hide.
 */
export type AssetsControllerHideAssetAction = {
  type: `AssetsController:hideAsset`;
  handler: AssetsController['hideAsset'];
};

/**
 * Unhide an asset globally.
 *
 * @param assetId - The CAIP-19 asset ID to unhide.
 */
export type AssetsControllerUnhideAssetAction = {
  type: `AssetsController:unhideAsset`;
  handler: AssetsController['unhideAsset'];
};

/**
 * Set the current currency.
 *
 * @param selectedCurrency - The ISO 4217 currency code to set.
 */
export type AssetsControllerSetSelectedCurrencyAction = {
  type: `AssetsController:setSelectedCurrency`;
  handler: AssetsController['setSelectedCurrency'];
};

/**
 * Union of all AssetsController action types.
 */
export type AssetsControllerMethodActions =
  | AssetsControllerGetAssetsAction
  | AssetsControllerGetAssetsBalanceAction
  | AssetsControllerGetAssetMetadataAction
  | AssetsControllerGetAccountAssetByIDAction
  | AssetsControllerGetAccountAssetsByIDsAction
  | AssetsControllerGetAccountAssetsByScopeAction
  | AssetsControllerGetAssetsPriceAction
  | AssetsControllerGetExchangeRatesForBridgeAction
  | AssetsControllerGetStateForTransactionPayAction
  | AssetsControllerAddCustomAssetAction
  | AssetsControllerRemoveCustomAssetAction
  | AssetsControllerGetCustomAssetsAction
  | AssetsControllerHideAssetAction
  | AssetsControllerUnhideAssetAction
  | AssetsControllerSetSelectedCurrencyAction;
