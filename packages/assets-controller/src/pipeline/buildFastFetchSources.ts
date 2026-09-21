import {
  createParallelBalanceMiddleware,
  createParallelMiddleware,
} from '../middlewares/ParallelMiddleware.js';
import type { BalanceSource } from '../middlewares/ParallelMiddleware.js';
import type { AssetsDataSource } from '../types.js';

/**
 * The sources the fast fetch lane composes, in the roles the lane assigns them.
 *
 * `AssetsController` constructs all of these unconditionally, so the lane can
 * assume every role is filled. `isBasicFunctionality` decides which of them
 * actually run, not which are supplied.
 */
export type FastFetchSources = {
  accountsApiDataSource: BalanceSource;
  stakedBalanceDataSource: BalanceSource;
  rpcFallbackMiddleware: AssetsDataSource;
  detectionMiddleware: AssetsDataSource;
  tokenDataSource: AssetsDataSource;
  priceDataSource: AssetsDataSource;
};

/**
 * Compose the fast fetch lane: balances in parallel → RPC fallback →
 * detection → token metadata and prices in parallel.
 *
 * Snap and RPC balance sources are deliberately absent — the controller runs
 * those in a background lane because of their latency.
 *
 * Custom assets are deliberately never removed from `customAssets` here, even
 * once upstream balance sources start reporting them: a token dropped from
 * `customAssets` loses its exemption from occurrence / Blockaid spam filtering
 * in `TokenDataSource` and can then be auto-filtered out of the wallet.
 *
 * @param sources - The sources to place into the lane.
 * @param options - Lane options.
 * @param options.isBasicFunctionality - When false, only the staking balance and
 * detection run; no network-backed source is used.
 * @returns The composed source list, ready for `executeAssetsPipeline`.
 */
export function buildFastFetchSources(
  sources: FastFetchSources,
  options: { isBasicFunctionality: boolean },
): AssetsDataSource[] {
  const {
    accountsApiDataSource,
    stakedBalanceDataSource,
    rpcFallbackMiddleware,
    detectionMiddleware,
    tokenDataSource,
    priceDataSource,
  } = sources;

  if (!options.isBasicFunctionality) {
    return [stakedBalanceDataSource, detectionMiddleware];
  }

  return [
    createParallelBalanceMiddleware([
      accountsApiDataSource,
      stakedBalanceDataSource,
    ]),
    rpcFallbackMiddleware,
    detectionMiddleware,
    createParallelMiddleware([tokenDataSource, priceDataSource]),
  ];
}
