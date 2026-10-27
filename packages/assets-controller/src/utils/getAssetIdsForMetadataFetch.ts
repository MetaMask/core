import { parseCaipAssetType } from '@metamask/utils';

import { isStakingContractAssetId } from '../data-sources/evm-rpc-services/index.js';
import type {
  AssetMetadata,
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
   * Asset IDs that must skip spam filtering (state balance heals and response
   * balances already known in state).
   */
  balanceHealAssetIds: Set<string>;
};

/**
 * Metadata to fetch for this request.
 *
 * State balances whose metadata is missing a field that controller logic or a
 * client reads are heals: they are enriched and not spam-filtered. Those
 * fields are `symbol`, `name`, `decimals`, `image`, `aggregators`, and
 * `occurrences`. Response balances are included too; a response balance
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
  const knownMetadataIds = new Set(Object.keys(stateMetadata));
  const assetIdsNeedingMetadata = new Set<string>();
  const balanceHealAssetIds = new Set<string>();
  const stateBalanceIds = new Set<string>();

  const needsMetadata = (assetId: string): boolean => {
    if (hiddenAssetIds.has(assetId)) {
      return false;
    }
    if (
      hasMetadataUsedByClients(response.assetsInfo?.[assetId as Caip19AssetId])
    ) {
      return false;
    }
    if (hasMetadataUsedByClients(stateMetadata[assetId as Caip19AssetId])) {
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
      stateBalanceIds.add(assetId);
      if (!inRequestChains(assetId) || !needsMetadata(assetId)) {
        continue;
      }
      assetIdsNeedingMetadata.add(assetId);
      balanceHealAssetIds.add(assetId);
    }
  }

  for (const accountBalances of Object.values(response.assetsBalance ?? {})) {
    for (const assetId of Object.keys(accountBalances)) {
      if (!needsMetadata(assetId)) {
        continue;
      }
      assetIdsNeedingMetadata.add(assetId);
      if (stateBalanceIds.has(assetId) || knownMetadataIds.has(assetId)) {
        balanceHealAssetIds.add(assetId);
      }
    }
  }

  return { assetIdsNeedingMetadata, balanceHealAssetIds };
}

/**
 * True when metadata already has every field that controller logic or a
 * client reads from `assetsInfo`.
 *
 * @param metadata - Stored or in-flight asset metadata.
 * @returns Whether another metadata fetch can be skipped.
 */
function hasMetadataUsedByClients(
  metadata: AssetMetadata | undefined,
): boolean {
  if (
    !metadata ||
    !('aggregators' in metadata) ||
    !('occurrences' in metadata)
  ) {
    return false;
  }

  return (
    hasText(metadata.symbol) &&
    hasText(metadata.name) &&
    isFiniteNonNegative(metadata.decimals) &&
    hasText(metadata.image) &&
    Array.isArray(metadata.aggregators) &&
    isFiniteNonNegative(metadata.occurrences)
  );
}

/**
 * @param value - Candidate string field.
 * @returns Whether the field is a non-empty string.
 */
function hasText(value: string | undefined): boolean {
  return typeof value === 'string' && value.length > 0;
}

/**
 * @param value - Candidate numeric field.
 * @returns Whether the field is a finite number greater than or equal to zero.
 */
function isFiniteNonNegative(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
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
 * Keys of assets the user has marked hidden.
 *
 * @param assetPreferences - Preference map from controller state.
 * @returns Set of hidden asset IDs.
 */
function collectHiddenAssetIdKeys(
  assetPreferences: AssetsControllerState['assetPreferences'] | undefined,
): Set<string> {
  return new Set(
    Object.entries(assetPreferences ?? {})
      .filter(([, preferences]) => preferences.hidden)
      .map(([assetId]) => assetId),
  );
}
