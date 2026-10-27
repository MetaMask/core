import { createParallelMiddleware } from '../middlewares/ParallelMiddleware.js';
import type { AssetsDataSource, Middleware } from '../types.js';

/** The sources the websocket update lane composes. */
export type WsUpdateSources = {
  rpcFallbackMiddleware: AssetsDataSource;
  /** Also supplies the occurrence-filter middleware used for websocket airdrops. */
  tokenDataSource: AssetsDataSource & {
    readonly occurrenceFilterMiddleware: Middleware;
  };
  priceDataSource: AssetsDataSource;
};

/**
 * Compose the websocket update lane.
 *
 * When basic functionality is on, the lane filters new tokens by occurrence,
 * retries errored chains on RPC, then fetches token metadata and prices.
 * A pin stays in `customAssets` until `removeCustomAsset`.
 *
 * @param sources - The sources to place into the lane.
 * @param options - Lane options.
 * @param options.isBasicFunctionality - When false, no network-backed source
 * runs.
 * @returns The composed source list, ready for `executeAssetsPipeline`.
 */
export function buildWsUpdateSources(
  sources: WsUpdateSources,
  options: {
    isBasicFunctionality: boolean;
  },
): AssetsDataSource[] {
  if (!options.isBasicFunctionality) {
    return [];
  }

  const { rpcFallbackMiddleware, tokenDataSource, priceDataSource } = sources;

  const occurrenceFloorFilter: AssetsDataSource = {
    getName: (): string => 'OccurrenceFloorFilter',
    assetsMiddleware: tokenDataSource.occurrenceFilterMiddleware,
  };

  return [
    occurrenceFloorFilter,
    rpcFallbackMiddleware,
    createParallelMiddleware([tokenDataSource, priceDataSource]),
  ];
}
