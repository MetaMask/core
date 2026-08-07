import { DEFAULT_TRACKED_ASSETS_BY_CHAIN } from '../defaults.js';
import type { AssetsControllerStateInternal, Caip19AssetId } from '../types.js';
import { isNativeAssetId } from './native-assets.js';

/** Lowercase CAIP-19 IDs of every default tracked asset, across all chains. */
const DEFAULT_TRACKED_ASSET_IDS: ReadonlySet<string> = new Set(
  [...DEFAULT_TRACKED_ASSETS_BY_CHAIN.values()].flatMap((assetIds) =>
    assetIds.map((assetId) => assetId.toLowerCase()),
  ),
);

/**
 * Delete `assetsInfo` and `assetsPrice` entries for assets that nothing in
 * state references anymore, so those slices do not grow unbounded (neither
 * has any other delete path).
 *
 * An asset is considered referenced — and its entries kept — when its ID is
 * any of the following (all comparisons are case-insensitive, since state
 * keys are checksummed while some sources emit lowercase IDs):
 *
 * - a key in `assetsBalance[accountId]` for ANY account in state (key
 *   presence is what counts: `addCustomAsset` and the native/default-asset
 *   seeders write `{ amount: '0' }` entries for held assets);
 * - listed in `customAssets` for any account;
 * - a native asset ID (see {@link isNativeAssetId});
 * - a default tracked asset ({@link DEFAULT_TRACKED_ASSETS_BY_CHAIN}) —
 *   these often have metadata but no balance (e.g. mUSD on Monad is
 *   pre-seeded into `assetsInfo` while its zero balance is only written
 *   once the chain is enabled), and deleting them would be permanent.
 *
 * `assetPreferences` is deliberately left untouched: a user who hid an
 * asset should find it still hidden if it ever comes back.
 *
 * @param state - The controller state to clean up (mutated in place).
 */
export function cleanupUnusedMetadata(
  state: AssetsControllerStateInternal,
): void {
  const referencedAssetIds = new Set<string>();
  for (const accountBalances of Object.values(state.assetsBalance)) {
    for (const assetId of Object.keys(accountBalances)) {
      referencedAssetIds.add(assetId.toLowerCase());
    }
  }
  for (const accountCustomAssets of Object.values(state.customAssets)) {
    for (const assetId of accountCustomAssets) {
      referencedAssetIds.add(assetId.toLowerCase());
    }
  }

  const isUnused = (assetId: string): boolean =>
    !referencedAssetIds.has(assetId.toLowerCase()) &&
    !DEFAULT_TRACKED_ASSET_IDS.has(assetId.toLowerCase()) &&
    !isNativeAssetId(assetId);

  for (const assetId of Object.keys(state.assetsInfo)) {
    if (isUnused(assetId)) {
      delete state.assetsInfo[assetId as Caip19AssetId];
    }
  }
  for (const assetId of Object.keys(state.assetsPrice)) {
    if (isUnused(assetId)) {
      delete state.assetsPrice[assetId as Caip19AssetId];
    }
  }
}
