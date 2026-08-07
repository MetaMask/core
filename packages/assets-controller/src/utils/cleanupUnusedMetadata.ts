import { DEFAULT_TRACKED_ASSETS_BY_CHAIN } from '../defaults.js';
import { isNativeAssetId } from './native-assets.js';

/**
 * The state slices {@link cleanupUnusedMetadata} operates on. The cleanup
 * only ever inspects keys (asset IDs) — values are never read — so value
 * types are `unknown`. This makes the parameter satisfiable both by
 * `AssetsControllerState` and by the immer draft passed to
 * `BaseController.update` (whose `WritableDraft`-wrapped values are not
 * assignable to their base types), so no type assertion is needed at call
 * sites. Omitting `assetPreferences` also guarantees at the type level that
 * the cleanup cannot touch it.
 */
export type CleanupUnusedMetadataState = {
  /** Shared metadata for all assets, keyed by CAIP-19 asset ID. */
  assetsInfo: Record<string, unknown>;
  /** Per-account balances, keyed by account ID then CAIP-19 asset ID. */
  assetsBalance: Record<string, Record<string, unknown>>;
  /** Price data for assets, keyed by CAIP-19 asset ID. */
  assetsPrice: Record<string, unknown>;
  /** Custom assets added by users per account (CAIP-19 asset IDs). */
  customAssets: Record<string, readonly string[]>;
};

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
export function cleanupUnusedMetadata(state: CleanupUnusedMetadataState): void {
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
      delete state.assetsInfo[assetId];
    }
  }
  for (const assetId of Object.keys(state.assetsPrice)) {
    if (isUnused(assetId)) {
      delete state.assetsPrice[assetId];
    }
  }
}
