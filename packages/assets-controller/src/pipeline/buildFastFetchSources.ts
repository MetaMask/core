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
 * assume every role is filled.
 */
export type FastFetchSources = {
  accountsApiDataSource: BalanceSource;
  customAssetGraduationMiddleware: AssetsDataSource;
  rpcFallbackMiddleware: AssetsDataSource;
  detectionMiddleware: AssetsDataSource;
  tokenDataSource: AssetsDataSource;
  priceDataSource: AssetsDataSource;
};

/**
 * Compose the fast fetch lane: Accounts API balances → custom-asset graduation →
 * RPC fallback → detection → token metadata and prices in parallel.
 *
 * Every source in this lane is backed by a MetaMask API, so the controller only
 * runs it when basic functionality is on.
 *
 * Snap and RPC balance sources are deliberately absent — the controller runs
 * those in a background lane because of their latency. The staked balance
 * source is absent too: it owns its own poll and post-transaction refresh, and
 * `AssetsController.getAssets` asks it to refresh directly on a force update
 * instead of routing it through this lane.
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
 * @param options.includeCustomAssetGraduation - `true` on the Accounts API v5
 * lane. The v6 lane never graduates custom assets: it sends the pins to the
 * endpoint as `includeAssetIds`, and a chain that comes back without all of
 * them is reported as errored so the RPC fallback refetches it.
 * @returns The composed source list, ready for `executeAssetsPipeline`.
 */
export function buildFastFetchSources(
  sources: FastFetchSources,
  options: {
    includeCustomAssetGraduation: boolean;
  },
): AssetsDataSource[] {
  const {
    accountsApiDataSource,
    customAssetGraduationMiddleware,
    rpcFallbackMiddleware,
    detectionMiddleware,
    tokenDataSource,
    priceDataSource,
  } = sources;

  return [
    createParallelBalanceMiddleware([accountsApiDataSource]),
    ...(options.includeCustomAssetGraduation
      ? [customAssetGraduationMiddleware]
      : []),
    rpcFallbackMiddleware,
    detectionMiddleware,
    createParallelMiddleware([tokenDataSource, priceDataSource]),
  ];
}
