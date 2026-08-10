import { DEFAULT_TRACKED_ASSETS_BY_CHAIN } from '../defaults.js';
import type { AssetsControllerStateInternal } from '../types.js';
import { isNativeAssetId } from './native-assets.js';

type AssetIdKeyedRecord = Record<string, unknown>;

export type CleanupUnusedMetadataState = {
  assetsInfo: AssetIdKeyedRecord;
  assetsBalance: Record<string, AssetIdKeyedRecord>;
  assetsPrice: AssetIdKeyedRecord;
  customAssets: AssetsControllerStateInternal['customAssets'];
};

/**
 * Delete `assetsInfo` / `assetsPrice` entries for assets that are not held,
 * custom, default tracked, or native.
 *
 * @param state - The controller state to clean up (mutated in place).
 */
export function cleanupUnusedMetadata(state: CleanupUnusedMetadataState): void {
  const defaultTrackedAssetIds = [
    ...DEFAULT_TRACKED_ASSETS_BY_CHAIN.values(),
  ].flat();
  const heldAssetIds = Object.values(state.assetsBalance).flatMap(
    (accountBalances) => Object.keys(accountBalances),
  );
  const customAssetIds = Object.values(state.customAssets).flat();

  const keptAssetIds = new Set(
    [...defaultTrackedAssetIds, ...heldAssetIds, ...customAssetIds].map(
      (assetId) => assetId.toLowerCase(),
    ),
  );
  const isUnused = (assetId: string): boolean =>
    !keptAssetIds.has(assetId.toLowerCase()) && !isNativeAssetId(assetId);

  for (const slice of [state.assetsInfo, state.assetsPrice]) {
    for (const assetId of Object.keys(slice).filter(isUnused)) {
      delete slice[assetId];
    }
  }
}
