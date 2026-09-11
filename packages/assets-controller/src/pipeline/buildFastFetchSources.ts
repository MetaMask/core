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
  customAssetGraduationMiddleware: AssetsDataSource;
  rpcFallbackMiddleware: AssetsDataSource;
  detectionMiddleware: AssetsDataSource;
  tokenDataSource: AssetsDataSource;
  priceDataSource: AssetsDataSource;
};

/**
 * Compose the fast fetch lane: balances in parallel → custom-asset graduation →
 * RPC fallback → detection → token metadata and prices in parallel.
 *
 * Snap and RPC balance sources are deliberately absent — the controller runs
 * those in a background lane because of their latency.
 *
 * Ordering carries two invariants:
 * - Graduation runs BEFORE the RPC fallback so it only ever sees Accounts
 *   API / websocket balances. RPC intentionally carries custom assets and must
 *   never trigger graduation.
 * - Detection runs before token and price enrichment, which both read
 *   `response.detectedAssets`.
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
    customAssetGraduationMiddleware,
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
    customAssetGraduationMiddleware,
    rpcFallbackMiddleware,
    detectionMiddleware,
    createParallelMiddleware([tokenDataSource, priceDataSource]),
  ];
}
