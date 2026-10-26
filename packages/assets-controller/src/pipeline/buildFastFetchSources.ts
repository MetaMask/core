import type { AssetsDataSource } from '../types.js';

/**
 * The balance source the fast fetch lane runs.
 *
 * `AssetsController` always has this source. `isBasicFunctionality` decides
 * whether the lane runs it.
 */
export type FastFetchSources = {
  accountsApiDataSource: AssetsDataSource;
};

/**
 * Compose the fast fetch lane.
 *
 * The lane is only the Accounts API call. A row with `symbol`, `name`, and
 * `decimals` is complete metadata, so the lane does not follow up with the
 * token service. The row's price, including `pricePercentChange1d`, is saved
 * with the balance. Errored chains wait for the background lane, which runs
 * Snap, RPC, the token service, and prices.
 *
 * @param sources - The Accounts API source.
 * @param options - Lane options.
 * @param options.isBasicFunctionality - When false, the lane is empty. The
 * RPC background lane fetches balances and then runs token and price.
 * @returns The composed source list, ready for `executeAssetsPipeline`.
 */
export function buildFastFetchSources(
  sources: FastFetchSources,
  options: {
    isBasicFunctionality: boolean;
  },
): AssetsDataSource[] {
  if (!options.isBasicFunctionality) {
    return [];
  }

  return [sources.accountsApiDataSource];
}
