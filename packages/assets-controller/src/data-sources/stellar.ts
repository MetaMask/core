// TODO(STELLAR): This helper is a temporary bridge for Snap-provided accountAssetInfo.
// Remove it once the Accounts API supports account-asset enrichment directly.
import type { SnapId } from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';
import type { CaipAssetType, CaipChainId } from '@metamask/utils';

export const STELLAR_CHAIN_ID = 'stellar:pubnet';

type GetAssetInfoRequestParams = {
  snapId: string;
  accountId: string;
  assets: CaipAssetType[];
};

type GetAssetInfoRequest = {
  snapId: SnapId;
  origin: 'metamask';
  handler: HandlerType.OnClientRequest;
  request: {
    jsonrpc: '2.0';
    method: 'getAccountAssetInfo';
    params: {
      accountId: string;
      scope: typeof STELLAR_CHAIN_ID;
      assets: CaipAssetType[];
    };
  };
};

export const getAssetInfoRequest = ({
  snapId,
  accountId,
  assets,
}: GetAssetInfoRequestParams): GetAssetInfoRequest => ({
  snapId: snapId as SnapId,
  origin: 'metamask',
  handler: HandlerType.OnClientRequest,
  request: {
    jsonrpc: '2.0',
    method: 'getAccountAssetInfo',
    params: {
      accountId,
      scope: STELLAR_CHAIN_ID,
      assets,
    },
  },
});

function hasNativeOrTrustlineAsset(assetId: CaipAssetType): boolean {
  return (
    assetId === 'stellar:pubnet/slip44:148' ||
    assetId.startsWith('stellar:pubnet/asset:')
  );
}

/**
 * Determines if asset metadata should be fetched for the given assets and snap.
 * Ensure only assets from the Stellar pubnet are fetched.
 * Ensure only Stellar Snap is used to fetch the asset metadata.
 *
 * @param assetIds - The CAIP-19 asset IDs to check.
 * @param chainToSnap - A mapping of CAIP-2 chain IDs to snap IDs.
 * @param snapId - The ID of the snap to check.
 * @returns True if asset metadata should be fetched, false otherwise.
 */
export function shouldFetchAssetMetadata(
  assetIds: CaipAssetType[],
  chainToSnap: Record<CaipChainId, string>,
  snapId: string,
): boolean {
  return (
    chainToSnap[STELLAR_CHAIN_ID] === snapId &&
    assetIds.some((assetId) => hasNativeOrTrustlineAsset(assetId))
  );
}

/**
 * Filters the given assets to only include those that are native or trustline assets.
 *
 * @param assetIds - The CAIP-19 asset IDs to filter.
 * @returns The filtered CAIP-19 asset IDs.
 */
export function filterEligibleAssetsToFetchMetadata(
  assetIds: CaipAssetType[],
): CaipAssetType[] {
  return assetIds.filter((assetId) => hasNativeOrTrustlineAsset(assetId));
}
