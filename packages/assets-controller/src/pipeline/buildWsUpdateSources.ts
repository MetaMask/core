import { createParallelMiddleware } from '../middlewares/ParallelMiddleware.js';
import type { AssetsDataSource, Middleware } from '../types.js';

/** The sources the websocket update lane composes. */
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
 * Compose the websocket update lane.
 *
 * @param sources - The sources to place into the lane.
 * @param options - Lane options.
 * @param options.isBasicFunctionality - When false, no network-backed source
 * runs.
 * @param options.includeCustomAssetGraduation - `true` on the v5 lane; the
 * v6 lane runs the RPC fallback instead of graduation.
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
