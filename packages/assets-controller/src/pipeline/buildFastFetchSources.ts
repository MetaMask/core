import { createParallelMiddleware } from '../middlewares/ParallelMiddleware.js';
import type { AssetsDataSource } from '../types.js';

/**
 * The sources the fast fetch lane composes, in the roles the lane assigns them.
 *
 * `AssetsController` constructs all of these unconditionally, so the lane can
 * assume every role is filled. `isBasicFunctionality` decides which of them
 * actually run, not which are supplied.
 */
export type FastFetchSources = {
  accountsApiDataSource: AssetsDataSource;
  customAssetGraduationMiddleware: AssetsDataSource;
  rpcFallbackMiddleware: AssetsDataSource;
  tokenDataSource: AssetsDataSource;
  priceDataSource: AssetsDataSource;
};

/**
 * Compose the fast fetch lane: balances in parallel → custom-asset graduation →
 * RPC fallback → token metadata and prices in parallel.
 *
 * Snap and RPC balance sources are deliberately absent — the controller runs
 * those in a background lane because of their latency.
 *
 * Ordering carries one invariant: graduation runs BEFORE the RPC fallback so
 * it only ever sees Accounts API / websocket balances. RPC intentionally
 * carries custom assets and must never trigger graduation. Token and price
 * enrichment each choose their own asset sets from the request and controller
 * state.
 *
 * @param sources - The sources to place into the lane.
 * @param options - Lane options.
 * @param options.isBasicFunctionality - When false, the lane is empty. No
 * balance source runs here, so there is no token or price source to feed.
 * The RPC background lane fetches balances and then runs token and price.
 * @param options.includeCustomAssetGraduation - `true` on the Accounts API v5
 * lane. The v6 lane never graduates custom assets: it sends the pins to the
 * endpoint as `includeAssetIds`, and a chain that comes back without all of
 * them is reported as errored so the RPC fallback refetches it.
 * @returns The composed source list, ready for `executeAssetsPipeline`.
 */
export function buildFastFetchSources(
  sources: FastFetchSources,
  options: {
    isBasicFunctionality: boolean;
    includeCustomAssetGraduation: boolean;
  },
): AssetsDataSource[] {
  const {
    accountsApiDataSource,
    customAssetGraduationMiddleware,
    rpcFallbackMiddleware,
    tokenDataSource,
    priceDataSource,
  } = sources;

  if (!options.isBasicFunctionality) {
    return [];
  }

  return [
    accountsApiDataSource,
    ...(options.includeCustomAssetGraduation
      ? [customAssetGraduationMiddleware]
      : []),
    rpcFallbackMiddleware,
    createParallelMiddleware([tokenDataSource, priceDataSource]),
  ];
}
