/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { SampleGasPricesService } from './sample-gas-prices-service';

/**
 * Makes a request to the API in order to retrieve gas prices for a particular
 * chain.
 *
 * @param chainId - The chain ID for which you want to fetch gas prices.
 * @returns The gas prices for the given chain.
 */
export type SampleGasPricesServiceFetchGasPricesAction = {
  type: `SampleGasPricesService:fetchGasPrices`;
  handler: SampleGasPricesService['fetchGasPrices'];
};

/**
 * Union of all SampleGasPricesService action types.
 */
export type SampleGasPricesServiceMethodActions =
  SampleGasPricesServiceFetchGasPricesAction;
