import { parseCaipAssetType } from '@metamask/utils';

import { isStakingContractAssetId } from '../data-sources/evm-rpc-services/index.js';
import type {
  AssetsControllerState,
  Caip19AssetId,
  DataRequest,
  DataResponse,
} from '../types.js';

export type GetAssetIdsForMetadataFetchParams = {
  /** Current AssetsController state slices used for candidate collection. */
  state: Pick<
    AssetsControllerState,
    'assetsBalance' | 'assetsInfo' | 'assetPreferences'
  >;
  /** Account and chain scope for the fetch. */
  request: Pick<DataRequest, 'accountsWithSupportedChains' | 'chainIds'>;
  /** Current pipeline response balances and metadata. */
  response: Pick<DataResponse, 'assetsBalance' | 'assetsInfo'>;
};

export type GetAssetIdsForMetadataFetchResult = {
  /** Asset IDs that still need metadata fetched. */
  assetIdsNeedingMetadata: Set<string>;
  /**
   * Lower-case asset IDs that must skip spam filtering (state balance heals
   * and response balances already known in state).
   */
  balanceHealAssetIds: Set<string>;
};

/**
 * Metadata to fetch for this request.
 *
 * State balances that have no metadata yet are heals: they are enriched and
 * not spam-filtered. Response balances are included too; a response balance
 * already present in state is a heal, and one that is new to state is
 * spam-filtered. Hidden assets are excluded.
 *
 * @param params - State, request scope, and response balances/metadata.
 * @param params.state - Controller state slices used for candidate collection.
 * @param params.request - Account and chain scope for the fetch.
 * @param params.response - Current pipeline response balances and metadata.
 * @returns Asset IDs to fetch, and the subset that must skip spam filtering.
 */
export function getAssetIdsForMetadataFetch({
  state,
  request,
  response,
}: GetAssetIdsForMetadataFetchParams): GetAssetIdsForMetadataFetchResult {
  const stateMetadata = state.assetsInfo ?? {};
  const accountFilter = buildAccountFilter(request);
  const chainFilter = buildChainFilter(request);
  const hiddenAssetIds = collectHiddenAssetIdKeys(state.assetPreferences);
  const knownMetadataIds = new Set(
    Object.keys(stateMetadata).map((assetId) => assetId.toLowerCase()),
  );
  const assetIdsNeedingMetadata = new Set<string>();
  const balanceHealAssetIds = new Set<string>();
  const stateBalanceIds = new Set<string>();

  const needsMetadata = (assetId: string): boolean => {
    if (hiddenAssetIds.has(assetId.toLowerCase())) {
      return false;
    }
    if (response.assetsInfo?.[assetId as Caip19AssetId]?.image) {
      return false;
    }
    if (stateMetadata[assetId as Caip19AssetId]?.image) {
      return false;
    }
    return !isStakingContractAssetId(assetId);
  };

  const inRequestChains = (assetId: string): boolean => {
    if (!chainFilter) {
      return true;
    }
    try {
      const { chainId } = parseCaipAssetType(assetId as Caip19AssetId);
      return chainFilter.has(chainId);
    } catch {
      return false;
    }
  };

  for (const [accountId, accountBalances] of Object.entries(
    state.assetsBalance ?? {},
  )) {
    if (accountFilter && !accountFilter.has(accountId)) {
      continue;
    }
    for (const assetId of Object.keys(accountBalances)) {
      stateBalanceIds.add(assetId.toLowerCase());
      if (!inRequestChains(assetId) || !needsMetadata(assetId)) {
        continue;
      }
      assetIdsNeedingMetadata.add(assetId);
      balanceHealAssetIds.add(assetId.toLowerCase());
    }
  }

  for (const accountBalances of Object.values(response.assetsBalance ?? {})) {
    for (const assetId of Object.keys(accountBalances)) {
      if (!needsMetadata(assetId)) {
        continue;
      }
      assetIdsNeedingMetadata.add(assetId);
      const lowerId = assetId.toLowerCase();
      if (stateBalanceIds.has(lowerId) || knownMetadataIds.has(lowerId)) {
        balanceHealAssetIds.add(lowerId);
      }
    }
  }

  return { assetIdsNeedingMetadata, balanceHealAssetIds };
}

/**
 * Account IDs from the request, or `undefined` when the request has none
 * (no account filtering).
 *
 * @param request - Request with accountsWithSupportedChains.
 * @returns Account ID set, or undefined when empty.
 */
function buildAccountFilter(
  request: Pick<DataRequest, 'accountsWithSupportedChains'>,
): Set<string> | undefined {
  const accountIds = request.accountsWithSupportedChains.map(
    ({ account }) => account.id,
  );
  return accountIds.length > 0 ? new Set(accountIds) : undefined;
}

/**
 * Chain IDs from the request, or `undefined` when the request has none
 * (no chain filtering).
 *
 * @param request - Request with chainIds.
 * @returns Chain ID set, or undefined when empty.
 */
function buildChainFilter(
  request: Pick<DataRequest, 'chainIds'>,
): Set<string> | undefined {
  return request.chainIds.length > 0 ? new Set(request.chainIds) : undefined;
}

/**
 * Lower-case keys of assets the user has marked hidden.
 *
 * @param assetPreferences - Preference map from controller state.
 * @returns Set of lower-case asset ID keys.
 */
function collectHiddenAssetIdKeys(
  assetPreferences: AssetsControllerState['assetPreferences'] | undefined,
): Set<string> {
  return new Set(
    Object.entries(assetPreferences ?? {})
      .filter(([, preferences]) => preferences.hidden)
      .map(([assetId]) => assetId.toLowerCase()),
  );
}
