import { DEFAULT_TRACKED_ASSETS_BY_CHAIN } from '../defaults.js';
import type { AssetsControllerStateInternal } from '../types.js';
import { isNativeAssetId } from './native-assets.js';

type AssetIdKeyedRecord = Record<string, unknown>;

/**
 * The state slices {@link cleanupUnusedMetadata} operates on. Only keys are
 * inspected, so slice values are `unknown` — this keeps both
 * `AssetsControllerState` and the immer draft passed to
 * `BaseController.update` assignable without type assertions.
 */
export type CleanupUnusedMetadataState = {
  assetsInfo: AssetIdKeyedRecord;
  assetsBalance: Record<string, AssetIdKeyedRecord>;
  assetsPrice: AssetIdKeyedRecord;
  customAssets: AssetsControllerStateInternal['customAssets'];
};

/**
 * Delete `assetsInfo` / `assetsPrice` entries whose asset ID (compared
 * case-insensitively) is not held by any account, not a custom asset, not a
 * default tracked asset, and not a native asset. `assetPreferences` is
 * deliberately left untouched.
 *
 * @param state - The controller state to clean up (mutated in place).
 */
export function cleanupUnusedMetadata(state: CleanupUnusedMetadataState): void {
  const keptAssetIds = new Set(
    [
      ...[...DEFAULT_TRACKED_ASSETS_BY_CHAIN.values()].flat(),
      ...Object.values(state.assetsBalance).flatMap((accountBalances) =>
        Object.keys(accountBalances),
      ),
      ...Object.values(state.customAssets).flat(),
    ].map((assetId) => assetId.toLowerCase()),
  );
  const isUnused = (assetId: string): boolean =>
    !keptAssetIds.has(assetId.toLowerCase()) && !isNativeAssetId(assetId);

  for (const slice of [state.assetsInfo, state.assetsPrice]) {
    for (const assetId of Object.keys(slice).filter(isUnused)) {
      delete slice[assetId];
    }
  }
}
