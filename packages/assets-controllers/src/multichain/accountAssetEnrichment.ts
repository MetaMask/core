import type { CaipAssetType, CaipChainId } from '@metamask/utils';
import { parseCaipAssetType } from '@metamask/utils';

/** Snap clientRequest method for per-(account, asset) enrichment data. */
export const GET_ACCOUNT_ASSET_INFO_CLIENT_METHOD =
  'getAccountAssetInfo' as const;

/** Optional per-asset fields returned by snap enrichment (chain-specific semantics). */
export type AccountAssetInfoExtra = {
  limit?: string;
  authorized?: boolean;
  sponsored?: boolean;
};

export type GetAccountAssetInfoResponse = Record<
  CaipAssetType,
  AccountAssetInfoExtra
>;

/**
 * Chains whose wallet snap implements {@link GET_ACCOUNT_ASSET_INFO_CLIENT_METHOD}.
 */
export const ACCOUNT_ASSET_INFO_ENRICHMENT_BY_CHAIN: Partial<
  Record<CaipChainId, boolean>
> = {
  'stellar:pubnet': true,
  'stellar:testnet': true,
};

/**
 * Returns whether the given chain supports snap account-asset enrichment.
 *
 * @param chainId - CAIP-2 chain identifier.
 * @returns True when enrichment is configured for the chain.
 */
export function isAccountAssetInfoEnrichmentAvailable(
  chainId: CaipChainId,
): boolean {
  return ACCOUNT_ASSET_INFO_ENRICHMENT_BY_CHAIN[chainId] === true;
}

/**
 * Filters asset ids to those on a chain that supports account-asset enrichment.
 *
 * @param assetIds - CAIP-19 asset types to filter.
 * @param chainId - Expected chain for enrichment (caller-provided scope).
 * @returns Asset ids on the given chain when enrichment is available.
 */
export function filterAssetsForAccountAssetEnrichment(
  assetIds: CaipAssetType[],
  chainId: CaipChainId,
): CaipAssetType[] {
  if (!isAccountAssetInfoEnrichmentAvailable(chainId)) {
    return [];
  }
  return assetIds.filter((assetId) => {
    try {
      return parseCaipAssetType(assetId).chainId === chainId;
    } catch {
      return false;
    }
  });
}
