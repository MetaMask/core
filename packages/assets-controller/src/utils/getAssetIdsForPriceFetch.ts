import { parseCaipAssetType } from '@metamask/utils';

import { projectLogger, createModuleLogger } from '../logger.js';
import type {
  AssetsControllerState,
  Caip19AssetId,
  DataRequest,
  DataResponse,
} from '../types.js';
import { safeNormalizeAssetId } from './normalizeAssetId.js';

const log = createModuleLogger(projectLogger, 'getAssetIdsForPriceFetch');

export type GetAssetIdsForPriceFetchParams = {
  /** Current AssetsController state slices used for candidate collection. */
  state: Pick<
    AssetsControllerState,
    'assetsBalance' | 'customAssets' | 'assetsInfo' | 'assetPreferences'
  >;
  /** Account and chain scope for the fetch. */
  request: Pick<DataRequest, 'accountsWithSupportedChains' | 'chainIds'>;
  /** Current pipeline response balances to include. */
  response: Pick<DataResponse, 'assetsBalance'>;
};

/**
 * Assets to price for this request: custom assets, balances, and metadata
 * already in state, plus balances on the current response, excluding hidden
 * assets. Scoped to the request's accounts and chains.
 *
 * @param params - State, request scope, and response balances.
 * @param params.state - Controller state slices used for candidate collection.
 * @param params.request - Account and chain scope for the fetch.
 * @param params.response - Current pipeline response balances to include.
 * @returns Deduplicated, normalized CAIP-19 asset IDs.
 */
export function getAssetIdsForPriceFetch({
  state,
  request,
  response,
}: GetAssetIdsForPriceFetchParams): Set<Caip19AssetId> {
  const accountFilter = buildAccountFilter(request);
  const chainFilter = buildChainFilter(request);
  const hiddenAssetIds = collectHiddenAssetIdKeys(state.assetPreferences);
  const assetIds = new Map<string, Caip19AssetId>();

  const addAssetId = (assetId: string): void => {
    addNormalizedAssetId(assetId, assetIds, chainFilter, hiddenAssetIds);
  };

  addBalancesFromAccounts(state.assetsBalance, accountFilter, addAssetId);
  addCustomAssets(state.customAssets, accountFilter, addAssetId);
  for (const assetId of Object.keys(state.assetsInfo ?? {})) {
    addAssetId(assetId);
  }
  addBalancesFromAccounts(response.assetsBalance, accountFilter, addAssetId);

  return new Set(assetIds.values());
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
 * Lower-case normalized keys of assets the user has marked hidden.
 *
 * @param assetPreferences - Preference map from controller state.
 * @returns Set of lower-case normalized CAIP-19 keys.
 */
function collectHiddenAssetIdKeys(
  assetPreferences: AssetsControllerState['assetPreferences'] | undefined,
): Set<string> {
  return new Set(
    Object.entries(assetPreferences ?? {})
      .filter(([, preferences]) => preferences.hidden)
      .map(([assetId]) =>
        safeNormalizeAssetId(assetId as Caip19AssetId).toLowerCase(),
      ),
  );
}

/**
 * Normalize `assetId`, apply chain/hidden filters, and store under a
 * case-insensitive key. Malformed IDs are skipped.
 *
 * @param assetId - Candidate CAIP-19 asset ID.
 * @param assetIds - Output map (lower-case key → normalized ID).
 * @param chainFilter - Optional allowed chain IDs.
 * @param hiddenAssetIds - Lower-case keys of hidden assets.
 */
function addNormalizedAssetId(
  assetId: string,
  assetIds: Map<string, Caip19AssetId>,
  chainFilter: Set<string> | undefined,
  hiddenAssetIds: Set<string>,
): void {
  try {
    const normalizedAssetId = safeNormalizeAssetId(assetId as Caip19AssetId);
    const { chainId } = parseCaipAssetType(normalizedAssetId);
    const key = normalizedAssetId.toLowerCase();
    if ((chainFilter && !chainFilter.has(chainId)) || hiddenAssetIds.has(key)) {
      return;
    }
    assetIds.set(key, normalizedAssetId);
  } catch (error) {
    log('Skipping malformed asset ID for price fetch', { assetId, error });
  }
}

/**
 * Add every asset ID under each account's balance map, optionally filtering
 * by account.
 *
 * @param balances - Account → asset balance map.
 * @param accountFilter - Optional allowed account IDs.
 * @param addAssetId - Callback that records a candidate asset ID.
 */
function addBalancesFromAccounts(
  balances: DataResponse['assetsBalance'] | undefined,
  accountFilter: Set<string> | undefined,
  addAssetId: (assetId: string) => void,
): void {
  for (const [accountId, accountBalances] of Object.entries(balances ?? {})) {
    if (accountFilter && !accountFilter.has(accountId)) {
      continue;
    }
    for (const assetId of Object.keys(accountBalances)) {
      addAssetId(assetId);
    }
  }
}

/**
 * Add custom (imported) asset IDs for accounts in scope.
 *
 * @param customAssets - Account → custom asset ID list.
 * @param accountFilter - Optional allowed account IDs.
 * @param addAssetId - Callback that records a candidate asset ID.
 */
function addCustomAssets(
  customAssets: AssetsControllerState['customAssets'] | undefined,
  accountFilter: Set<string> | undefined,
  addAssetId: (assetId: string) => void,
): void {
  for (const [accountId, customAssetIds] of Object.entries(
    customAssets ?? {},
  )) {
    if (accountFilter && !accountFilter.has(accountId)) {
      continue;
    }
    for (const assetId of customAssetIds) {
      addAssetId(assetId);
    }
  }
}
