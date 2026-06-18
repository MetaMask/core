import type { SnapController } from '@metamask/snaps-controllers';
import type { SnapId } from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';
import type { CaipChainId } from '@metamask/utils';
import { KnownCaipNamespace, parseCaipAssetType } from '@metamask/utils';

import type {
  AccountAssetInfoExtra,
  AssetBalance,
  AssetsUpdateMode,
  Caip19AssetId,
  FungibleAssetBalance,
  GetAccountAssetInfoResponse,
} from '../types';
import { fetchWithTimeout } from './fetchWithTimeout';

/** Snap clientRequest method for per-(account, asset) enrichment data. */
export const GET_ACCOUNT_ASSET_INFO_CLIENT_METHOD =
  'getAccountAssetInfo' as const;

/**
 * Max assets per snap `getAccountAssetInfo` request. Large batches can terminate
 * the Stellar wallet snap on mobile when many trustlines are fetched at once.
 */
export const ACCOUNT_ASSET_INFO_SNAP_BATCH_SIZE = 3;

/** Per-batch snap client request timeout (ms). Hung requests must not block apply. */
export const ACCOUNT_ASSET_INFO_SNAP_TIMEOUT_MS = 15_000;

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
 * Returns whether the asset id is a Stellar classic `asset:` token.
 *
 * @param assetId - CAIP-19 asset id.
 * @returns True for Stellar classic assets on pubnet/testnet.
 */
export function isStellarClassicAssetId(assetId: Caip19AssetId): boolean {
  try {
    const parsed = parseCaipAssetType(assetId);
    return (
      parsed.chain.namespace === KnownCaipNamespace.Stellar &&
      parsed.assetNamespace === 'asset'
    );
  } catch {
    return false;
  }
}

/**
 * Filters asset ids to Stellar classic tokens on an enrichment-enabled chain.
 *
 * @param assetIds - CAIP-19 asset types to filter.
 * @param chainId - Expected chain for enrichment (caller-provided scope).
 * @returns Stellar classic asset ids on the given chain when enrichment is available.
 */
export function filterStellarClassicAssetsForEnrichment(
  assetIds: Caip19AssetId[],
  chainId: CaipChainId,
): Caip19AssetId[] {
  if (!isAccountAssetInfoEnrichmentAvailable(chainId)) {
    return [];
  }
  return assetIds.filter((assetId) => {
    try {
      return (
        parseCaipAssetType(assetId).chainId === chainId &&
        isStellarClassicAssetId(assetId)
      );
    } catch {
      return false;
    }
  });
}

/**
 * Builds inactive trustline extra for Stellar classic invalidation.
 * Uses `limit: '0'` so UI treats the trustline as inactive rather than unknown.
 *
 * @param previous - Prior enrichment fields to preserve (authorized, sponsored).
 * @returns Extra with zero limit.
 */
export function createInvalidatedStellarClassicExtra(
  previous?: AccountAssetInfoExtra,
): AccountAssetInfoExtra {
  return {
    ...previous,
    limit: '0',
  };
}

/**
 * Merges incoming balance rows into prior rows, preserving `extra` when the
 * incoming row is amount-only (as snap balance sync responses are).
 *
 * @param previous - Prior balance row, if any.
 * @param incoming - Incoming balance row from a data source.
 * @returns Merged balance row.
 */
export function mergeAssetBalanceRow(
  previous: AssetBalance | undefined,
  incoming: AssetBalance,
): AssetBalance {
  const prev = previous ?? ({ amount: '0' } as FungibleAssetBalance);
  const prevExtra = (prev as FungibleAssetBalance).extra;
  const incomingExtra = (incoming as FungibleAssetBalance).extra;

  const merged: FungibleAssetBalance = {
    ...(prev as FungibleAssetBalance),
    ...(incoming as FungibleAssetBalance),
    amount: (incoming as FungibleAssetBalance).amount,
  };

  if (incomingExtra !== undefined) {
    merged.extra = incomingExtra;
  } else if (prevExtra !== undefined) {
    merged.extra = prevExtra;
  }

  return merged;
}

/**
 * Builds the effective per-account balance map for a data-source response.
 * Snap/RPC balance sync responses are amount-only and must not erase separately
 * stored account-asset enrichment (e.g. Stellar trustline `extra`).
 *
 * @param previousBalances - Prior balances for the account.
 * @param incomingBalances - Incoming balances from the data source.
 * @param mode - Merge overlays incoming rows; full replaces covered chains.
 * @param customAssetIds - Custom assets to preserve when omitted from full responses.
 * @returns Effective balance map before amount normalization.
 */
export function buildEffectiveAccountBalances(
  previousBalances: Record<string, AssetBalance>,
  incomingBalances: Record<string, AssetBalance>,
  mode: AssetsUpdateMode,
  customAssetIds: Caip19AssetId[],
): Record<string, AssetBalance> {
  if (mode === 'merge') {
    const effective: Record<string, AssetBalance> = { ...previousBalances };
    for (const [assetId, incoming] of Object.entries(incomingBalances)) {
      effective[assetId] = mergeAssetBalanceRow(
        previousBalances[assetId],
        incoming,
      );
    }
    return effective;
  }

  const coveredChains = new Set(
    Object.keys(incomingBalances).map((assetId) => assetId.split('/')[0]),
  );

  const next: Record<string, AssetBalance> = {};
  for (const [assetId, balance] of Object.entries(previousBalances)) {
    if (!coveredChains.has(assetId.split('/')[0])) {
      next[assetId] = balance;
    }
  }

  // Snap/RPC balance sync responses are amount-only; per-row merge preserves
  // account-asset enrichment stored separately (e.g. Stellar trustline extra).
  for (const [assetId, incoming] of Object.entries(incomingBalances)) {
    next[assetId] = mergeAssetBalanceRow(previousBalances[assetId], incoming);
  }

  for (const customId of customAssetIds) {
    next[customId] ??=
      previousBalances[customId] ?? ({ amount: '0' } as AssetBalance);
  }

  return next;
}

/**
 * Builds a snap client request for `getAccountAssetInfo`.
 *
 * @param snapId - Wallet snap id.
 * @param params - Account, chain scope, and assets to resolve.
 * @param params.accountId - Account to fetch enrichment for.
 * @param params.scope - CAIP-2 chain id passed to the snap handler.
 * @param params.assets - CAIP-19 asset ids to resolve.
 * @returns Payload for `SnapController:handleRequest`.
 */
export function createGetAccountAssetInfoClientRequest(
  snapId: SnapId,
  params: {
    accountId: string;
    scope: CaipChainId;
    assets: Caip19AssetId[];
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
 * @param options.accountId - Account to fetch enrichment for.
 * @param options.snapId - Wallet snap id to invoke.
 * @param options.chainId - CAIP-2 chain id for the snap request scope.
 * @param options.assets - CAIP-19 asset ids to enrich.
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
    assets: Caip19AssetId[];
  },
): Promise<GetAccountAssetInfoResponse | undefined> {
  if (assets.length === 0) {
    return undefined;
  }

  const request = createGetAccountAssetInfoClientRequest(snapId, {
    accountId,
    scope: chainId,
    assets,
  });

  try {
    const response = (await fetchWithTimeout(
      () => handleSnapRequest(request),
      ACCOUNT_ASSET_INFO_SNAP_TIMEOUT_MS,
    )) as GetAccountAssetInfoResponse | undefined;

    return response;
  } catch {
    return undefined;
  }
}
