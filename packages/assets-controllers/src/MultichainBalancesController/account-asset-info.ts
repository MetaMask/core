import type { Balance } from '@metamask/keyring-api';
import type { SnapController } from '@metamask/snaps-controllers';
import type { SnapId } from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';
import type { CaipAssetType, CaipChainId } from '@metamask/utils';
import { parseCaipAssetType } from '@metamask/utils';

/** Snap clientRequest method for per-(account, asset) enrichment data. */
export const GET_ACCOUNT_ASSET_INFO_CLIENT_METHOD =
  'getAccountAssetInfo' as const;

/** Optional per-asset fields returned by snap enrichment (chain-specific semantics). */
export type AccountAssetInfo = {
  limit?: string;
  authorized?: boolean;
  sponsored?: boolean;
};

export type GetAccountAssetInfoResponse = Record<
  CaipAssetType,
  AccountAssetInfo
>;

/** Per-asset balance row; `accountAssetInfo` carries chain-specific snap enrichment fields. */
export type MultichainAccountBalance = {
  amount: string;
  unit: string;
  accountAssetInfo?: AccountAssetInfo;
};

/**
 * Chains whose wallet snap implements {@link GET_ACCOUNT_ASSET_INFO_CLIENT_METHOD}.
 */
export const ACCOUNT_ASSET_INFO_ENRICHMENT_BY_CHAIN: Partial<
  Record<CaipChainId, boolean>
> = {
  'stellar:pubnet': true,
  'stellar:testnet': true,
};

/** Caller shape for `SnapController:handleRequest`. */
export type SnapHandleRequestCaller = (
  params: Parameters<SnapController['handleRequest']>[0],
) => Promise<unknown>;

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
 * Builds a snap client request for `getAccountAssetInfo`.
 *
 * @param snapId - Wallet snap id.
 * @param params - Account, chain scope, and assets to resolve.
 * @param params.accountId - Account id passed to the snap client request.
 * @param params.scope - CAIP-2 chain id for enrichment.
 * @param params.assets - CAIP-19 assets to resolve.
 * @returns Payload for `SnapController:handleRequest`.
 */
export function createGetAccountAssetInfoClientRequest(
  snapId: SnapId,
  params: {
    accountId: string;
    scope: CaipChainId;
    assets: CaipAssetType[];
  },
): Parameters<SnapController['handleRequest']>[0] {
  return {
    snapId,
    origin: 'metamask',
    handler: HandlerType.OnClientRequest,
    request: {
      jsonrpc: '2.0',
      method: GET_ACCOUNT_ASSET_INFO_CLIENT_METHOD,
      params,
    },
  };
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
  handleSnapRequest: SnapHandleRequestCaller,
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
  if (assets.length === 0) {
    return undefined;
  }

  try {
    return (await handleSnapRequest(
      createGetAccountAssetInfoClientRequest(snapId, {
        accountId,
        scope: chainId,
        assets,
      }),
    )) as GetAccountAssetInfoResponse;
  } catch {
    return undefined;
  }
}

/**
 * Combines snap balance rows with optional per-asset enrichment fields.
 *
 * @param assetIds - Assets to include in the result.
 * @param balances - Balance rows keyed by asset id.
 * @param enrichment - Optional snap enrichment keyed by asset id.
 * @returns Per-asset balance rows with merged `accountAssetInfo` when present.
 */
export function buildBalanceRowsWithAccountAssetInfo(
  assetIds: CaipAssetType[],
  balances: Record<CaipAssetType, Balance>,
  enrichment?: GetAccountAssetInfoResponse,
): Record<string, MultichainAccountBalance> {
  return Object.fromEntries(
    assetIds.map((assetId) => {
      const balance = balances[assetId] ?? { amount: '0', unit: '' };
      const accountAssetInfo = enrichment?.[assetId];

      return [
        assetId,
        {
          ...balance,
          ...(accountAssetInfo === undefined ? {} : { accountAssetInfo }),
        },
      ];
    }),
  );
}
