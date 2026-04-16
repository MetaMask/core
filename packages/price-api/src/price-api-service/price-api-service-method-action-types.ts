/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { PriceApiService } from './price-api-service';

/**
 * Get historical prices by CAIP-19 asset ID (v3 endpoint).
 *
 * @param args - The arguments to this function.
 * @param args.params - Essential request parameters. Usually `{ chainId,
 * assetType }` where `chainId` is the CAIP-2 chain ID and `assetType` is the
 * asset type portion of CAIP-19. May also be `null` to "disable" the query.
 * @param args.options - Optional request parameters.
 * @param args.options.currency - The currency for prices.
 * @param args.options.timePeriod - The time period.
 * @param args.options.from - Start timestamp.
 * @param args.options.to - End timestamp.
 * @param args.options.interval - Data interval.
 * @returns The historical prices response.
 */
export type PriceApiServiceFetchHistoricalPricesV3Action = {
  type: `PriceApiService:fetchHistoricalPricesV3`;
  handler: PriceApiService['fetchHistoricalPricesV3'];
};

/**
 * Union of all PriceApiService action types.
 */
export type PriceApiServiceMethodActions =
  PriceApiServiceFetchHistoricalPricesV3Action;
