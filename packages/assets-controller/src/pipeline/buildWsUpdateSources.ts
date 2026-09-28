import { createParallelMiddleware } from '../middlewares/ParallelMiddleware.js';
import type { AssetsDataSource, Middleware } from '../types.js';

/**
 * The sources the websocket update lane composes, in the roles the lane
 * assigns them.
 *
 * `AssetsController` constructs all of these unconditionally, so the lane can
 * assume every role is filled. `isBasicFunctionality` decides which of them
 * actually run, not which are supplied.
 */
export type WsUpdateSources = {
  customAssetGraduationMiddleware: AssetsDataSource;
  rpcFallbackMiddleware: AssetsDataSource;
  detectionMiddleware: AssetsDataSource;
  /** Also supplies the occurrence-filter middleware used for websocket airdrops. */
  tokenDataSource: AssetsDataSource & {
    readonly occurrenceFilterMiddleware: Middleware;
  };
  priceDataSource: AssetsDataSource;
};

/**
 * Compose the websocket update lane: custom-asset graduation (v5 only) →
 * occurrence filtering → RPC fallback (v6 only) → detection → token metadata
 * and prices in parallel.
 *
 * Extracted from `AssetsController#handleAssetsUpdateV5` and
 * `#handleAssetsUpdateV6` so the lane can be composed and driven without
 * booting the controller (mirroring `buildFastFetchSources` for the fast
 * fetch lane).
 *
 * Ordering carries two invariants:
 * - Occurrence filtering runs BEFORE the RPC fallback and detection, so a
 *   websocket airdrop below its chain's occurrence floor is never detected,
 *   enriched, priced or persisted.
 * - Detection runs before token and price enrichment, which both read
 *   `response.detectedAssets`.
 *
 * @param sources - The sources to place into the lane.
 * @param options - Lane options.
 * @param options.isBasicFunctionality - When false, only graduation (v5) and
 * detection run; no network-backed source is used.
 * @param options.includeCustomAssetGraduation - `true` on the v5 update lane.
 * The v6 lane never graduates custom assets — it sends the pins to the
 * endpoint as `includeAssetIds` — and instead runs the RPC fallback before
 * detection.
 * @returns The composed source list, ready for `executeAssetsPipeline`.
 */
export function buildWsUpdateSources(
  sources: WsUpdateSources,
  options: {
    isBasicFunctionality: boolean;
    includeCustomAssetGraduation: boolean;
  },
): AssetsDataSource[] {
  const {
    customAssetGraduationMiddleware,
    rpcFallbackMiddleware,
    detectionMiddleware,
    tokenDataSource,
    priceDataSource,
  } = sources;

  const occurrenceFloorFilter: AssetsDataSource = {
    getName: (): string => 'OccurrenceFloorFilter',
    assetsMiddleware: tokenDataSource.occurrenceFilterMiddleware,
  };

  return [
    ...(options.includeCustomAssetGraduation
      ? [customAssetGraduationMiddleware]
      : []),
    ...(options.isBasicFunctionality ? [occurrenceFloorFilter] : []),
    ...(!options.includeCustomAssetGraduation && options.isBasicFunctionality
      ? [rpcFallbackMiddleware]
      : []),
    detectionMiddleware,
    ...(options.isBasicFunctionality
      ? [createParallelMiddleware([tokenDataSource, priceDataSource])]
      : []),
  ];
}
