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
  detectionMiddleware: AssetsDataSource;
  /** Also supplies the occurrence-filter middleware used for websocket airdrops. */
  tokenDataSource: AssetsDataSource & {
    readonly occurrenceFilterMiddleware: Middleware;
  };
  priceDataSource: AssetsDataSource;
};

/**
 * Compose the websocket (AccountActivity) update lane: custom-asset graduation →
 * occurrence filtering → detection → token metadata and prices in parallel.
 *
 * Extracted from `AssetsController#handleAssetsUpdate` so the lane can be
 * composed and driven without booting the controller (mirroring
 * `buildFastFetchSources` for the fast fetch lane).
 *
 * Ordering carries two invariants:
 * - Occurrence filtering runs BEFORE detection, so a websocket airdrop below
 *   its chain's occurrence floor is never detected, enriched, priced or
 *   persisted.
 * - Detection runs before token and price enrichment, which both read
 *   `response.detectedAssets`.
 *
 * @param sources - The sources to place into the lane.
 * @param options - Lane options.
 * @param options.isBasicFunctionality - When false, only graduation and
 * detection run; no network-backed source is used.
 * @returns The composed source list, ready for `executeAssetsPipeline`.
 */
export function buildWsUpdateSources(
  sources: WsUpdateSources,
  options: { isBasicFunctionality: boolean },
): AssetsDataSource[] {
  const {
    customAssetGraduationMiddleware,
    detectionMiddleware,
    tokenDataSource,
    priceDataSource,
  } = sources;

  const occurrenceFloorFilter: AssetsDataSource = {
    getName: (): string => 'OccurrenceFloorFilter',
    assetsMiddleware: tokenDataSource.occurrenceFilterMiddleware,
  };

  const pipeline: AssetsDataSource[] = [
    customAssetGraduationMiddleware,
    ...(options.isBasicFunctionality ? [occurrenceFloorFilter] : []),
    detectionMiddleware,
  ];
  if (options.isBasicFunctionality) {
    pipeline.push(createParallelMiddleware([tokenDataSource, priceDataSource]));
  }
  return pipeline;
}
