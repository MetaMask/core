import type { SnapId } from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';
import type { CaipAssetType, CaipChainId } from '@metamask/utils';
import { parseCaipAssetType } from '@metamask/utils';

import { isStellarTrustlineTrackedAsset } from './stellarTrustline';

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

/**
 * Filters asset ids to Stellar classic trust-line tracked assets on an enrichment-enabled chain.
 *
 * @param assetIds - CAIP-19 asset types to filter.
 * @param chainId - Expected chain for enrichment (caller-provided scope).
 * @returns Stellar classic asset ids eligible for trust-line enrichment.
 */
export function filterStellarClassicAssetsForEnrichment(
  assetIds: CaipAssetType[],
  chainId: CaipChainId,
): CaipAssetType[] {
  return filterAssetsForAccountAssetEnrichment(assetIds, chainId).filter(
    (assetId) => isStellarTrustlineTrackedAsset(assetId),
  );
}

/**
 * Returns whether balance `extra` should be refreshed from the snap.
 * Missing `extra`, missing `limit`, or zero/absent limit means inactive or unknown trust-line state.
 *
 * @param extra - Existing balance enrichment fields, if any.
 * @returns True when a snap fetch should update `extra`.
 */
export function accountAssetExtraNeedsRefresh(
  extra: AccountAssetInfoExtra | undefined,
): boolean {
  if (extra === undefined || extra.limit === undefined) {
    return true;
  }

  const parsed = Number.parseFloat(extra.limit);
  if (Number.isNaN(parsed)) {
    return true;
  }

  return parsed <= 0;
}

/**
 * Calls the snap `getAccountAssetInfo` client request handler.
 *
 * @param handleSnapRequest - SnapController handleRequest messenger action.
 * @param options - Request parameters.
 * @param options.accountId - Account id.
 * @param options.snapId - Wallet snap id.
 * @param options.chainId - CAIP-2 chain id.
 * @param options.assets - CAIP-19 assets to resolve.
 * @returns Per-asset enrichment fields, or undefined on failure.
 */
export async function fetchAccountAssetInfoFromSnap(
  handleSnapRequest: (params: {
    snapId: SnapId;
    origin: string;
    handler: HandlerType;
    request: {
      jsonrpc: '2.0';
      method: typeof GET_ACCOUNT_ASSET_INFO_CLIENT_METHOD;
      params: {
        accountId: string;
        scope: CaipChainId;
        assets: CaipAssetType[];
      };
    };
  }) => Promise<unknown>,
  {
    accountId,
    snapId,
    chainId,
    assets,
  }: {
    accountId: string;
    snapId: SnapId;
    chainId: CaipChainId;
    assets: CaipAssetType[];
  },
): Promise<GetAccountAssetInfoResponse | undefined> {
  try {
    return (await handleSnapRequest({
      snapId,
      origin: 'metamask',
      handler: HandlerType.OnClientRequest,
      request: {
        jsonrpc: '2.0',
        method: GET_ACCOUNT_ASSET_INFO_CLIENT_METHOD,
        params: {
          accountId,
          scope: chainId,
          assets,
        },
      },
    })) as GetAccountAssetInfoResponse;
  } catch {
    return undefined;
  }
}
