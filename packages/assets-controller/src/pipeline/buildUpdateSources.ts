import { createParallelMiddleware } from '../middlewares/ParallelMiddleware.js';
import type { AssetsDataSource } from '../types.js';

/** The sources the standard update lane composes. */
export type UpdateSources = {
  customAssetGraduationMiddleware: AssetsDataSource;
  rpcFallbackMiddleware: AssetsDataSource;
  detectionMiddleware: AssetsDataSource;
  tokenDataSource: AssetsDataSource;
  priceDataSource: AssetsDataSource;
};

/**
 * Compose the update lane for the non-websocket sources.
 *
 * @param sources - The sources to place into the lane.
 * @param options - Lane options.
 * @param options.isBasicFunctionality - When false, no enrichment runs.
 * @param options.includeCustomAssetGraduation - When to include graduation.
 * @param options.includeRpcFallback - When to include the RPC fallback.
 * @returns The composed source list, ready for `executeAssetsPipeline`.
 */
export function buildUpdateSources(
  sources: UpdateSources,
  options: {
    isBasicFunctionality: boolean;
    includeCustomAssetGraduation: boolean;
    includeRpcFallback: boolean;
  },
): AssetsDataSource[] {
  const {
    customAssetGraduationMiddleware,
    rpcFallbackMiddleware,
    detectionMiddleware,
    tokenDataSource,
    priceDataSource,
  } = sources;

  return [
    ...(options.includeCustomAssetGraduation
      ? [customAssetGraduationMiddleware]
      : []),
    ...(options.includeRpcFallback ? [rpcFallbackMiddleware] : []),
    detectionMiddleware,
    ...(options.isBasicFunctionality
      ? [createParallelMiddleware([tokenDataSource, priceDataSource])]
      : []),
  ];
}
