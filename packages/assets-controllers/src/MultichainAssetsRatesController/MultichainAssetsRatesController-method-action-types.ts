/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { MultichainAssetsRatesController } from './MultichainAssetsRatesController';

/**
 * Updates token conversion rates for each non-EVM account.
 *
 * @returns A promise that resolves when the rates are updated.
 */
export type MultichainAssetsRatesControllerUpdateAssetsRatesAction = {
  type: `MultichainAssetsRatesController:updateAssetsRates`;
  handler: MultichainAssetsRatesController['updateAssetsRates'];
};

/**
 * Fetches historical prices for the current account
 *
 * @param asset - The asset to fetch historical prices for.
 * @param account - optional account to fetch historical prices for
 * @returns The historical prices.
 */
export type MultichainAssetsRatesControllerFetchHistoricalPricesForAssetAction =
  {
    type: `MultichainAssetsRatesController:fetchHistoricalPricesForAsset`;
    handler: MultichainAssetsRatesController['fetchHistoricalPricesForAsset'];
  };

/**
 * Union of all MultichainAssetsRatesController action types.
 */
export type MultichainAssetsRatesControllerMethodActions =
  | MultichainAssetsRatesControllerUpdateAssetsRatesAction
  | MultichainAssetsRatesControllerFetchHistoricalPricesForAssetAction;
