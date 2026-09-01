import type { AssetBalance, Caip19AssetId } from '../types.js';

/**
 * Read an asset's amount from a balance map, matching asset IDs
 * case-insensitively. State keys ERC-20 assets by checksummed address, while
 * some data sources return them lower-cased.
 *
 * @param balances - Balance map for a single account.
 * @param assetId - Asset ID to look up.
 * @returns The amount when present, otherwise `undefined`.
 */
export function findUpstreamAmount(
  balances: Record<string, AssetBalance> | undefined,
  assetId: Caip19AssetId,
): string | undefined {
  if (!balances) {
    return undefined;
  }
  if (balances[assetId]?.amount !== undefined) {
    return balances[assetId].amount;
  }
  const lowerCasedAssetId = assetId.toLowerCase();
  for (const [id, balance] of Object.entries(balances)) {
    if (id.toLowerCase() === lowerCasedAssetId) {
      return balance.amount;
    }
  }
  return undefined;
}

/**
 * Whether an upstream balance response carries no usable amount for an asset.
 *
 * The Accounts API omits tokens it does not index, and a returned `0` cannot be
 * distinguished from "not indexed", so both count as empty.
 *
 * @param balances - Balance map for a single account from the response.
 * @param assetId - Asset ID to check.
 * @returns True when the response holds no positive amount for the asset.
 */
export function isUpstreamBalanceEmpty(
  balances: Record<string, AssetBalance> | undefined,
  assetId: Caip19AssetId,
): boolean {
  const amount = findUpstreamAmount(balances, assetId);
  return !(Number(amount) > 0);
}
