import { isCaipAssetType, parseCaipAssetType } from '@metamask/utils';

import type { AssetsControllerState } from '../AssetsController.js';
import { DEFAULT_TRACKED_ASSETS_BY_CHAIN } from '../defaults.js';
import { ZERO_ADDRESS } from './constants.js';
import { buildNativeAssetsFromConstant } from './native-assets.js';

/**
 * Lowercase CAIP-19 IDs of natives that are not expressible through the
 * `slip44`/zero-address conventions (e.g. METIS and MNT, which use a "dead"
 * ERC-20 address). Built once from the hardcoded native asset registry.
 */
const KNOWN_NATIVE_ASSET_IDS: ReadonlySet<string> = new Set(
  Object.values(buildNativeAssetsFromConstant()).map((assetId) =>
    assetId.toLowerCase(),
  ),
);

/** Lowercase CAIP-19 IDs of every default tracked asset, across all chains. */
const DEFAULT_TRACKED_ASSET_IDS: ReadonlySet<string> = new Set(
  [...DEFAULT_TRACKED_ASSETS_BY_CHAIN.values()].flatMap((assetIds) =>
    assetIds.map((assetId) => assetId.toLowerCase()),
  ),
);

/**
 * Whether a CAIP-19 asset ID represents a chain's native asset. Pure
 * counterpart of `AssetsController.#isNativeAsset`: recognizes the `slip44`
 * namespace, the zero-address ERC-20 convention, and the hardcoded native
 * asset registry (which covers non-standard representations like METIS).
 *
 * @param assetId - The asset ID to check (any casing).
 * @returns True when the asset ID is a native asset.
 */
function isNativeAssetId(assetId: string): boolean {
  if (KNOWN_NATIVE_ASSET_IDS.has(assetId.toLowerCase())) {
    return true;
  }

  if (!isCaipAssetType(assetId)) {
    return false;
  }
  const parsed = parseCaipAssetType(assetId);

  if (parsed.assetNamespace === 'slip44') {
    return true;
  }

  return (
    parsed.assetNamespace === 'erc20' &&
    parsed.assetReference.toLowerCase() === ZERO_ADDRESS
  );
}

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
 * - a native asset ID;
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
export function cleanupUnusedMetadata(state: AssetsControllerState): void {
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
