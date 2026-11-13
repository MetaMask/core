import { parseCaipAssetType } from '@metamask/utils';

import { projectLogger, createModuleLogger } from '../logger.js';
import type {
  AssetsControllerState,
  Caip19AssetId,
  DataRequest,
  DataResponse,
} from '../types.js';
import { normalizeAssetId } from './normalizeAssetId.js';

const log = createModuleLogger(projectLogger, 'getAssetIdsForPriceFetch');

const NON_PRICEABLE_ASSET_PATTERNS = [
  // Synthetic slip44 staking-position assets: the Price API only knows about
  // pure numeric coin-type references (e.g. slip44:195). Any suffix after the
  // number is a MetaMask-internal synthetic asset that has no market price.
  /\/slip44:\d+-/u,
  // Tron non-price resource assets (bandwidth, energy)
  /\/slip44:bandwidth$/u,
  /\/slip44:energy$/u,
  /\/slip44:maximum-bandwidth$/u,
  /\/slip44:maximum-energy$/u,
];

/**
 * Check if an asset ID represents a priceable asset.
 * Filters out internal resource tracking values that don't have market prices.
 *
 * @param assetId - The CAIP-19 asset ID to check.
 * @returns True if the asset has market price data.
 */
export function isPriceableAsset(assetId: Caip19AssetId): boolean {
  return !NON_PRICEABLE_ASSET_PATTERNS.some((pattern) => pattern.test(assetId));
}

export type GetAssetIdsForPriceFetchParams = {
  /** Current AssetsController state slices used for candidate collection. */
  state: Pick<
    AssetsControllerState,
    'assetsBalance' | 'customAssets' | 'assetPreferences'
  >;
  /** Account and chain scope for the fetch. */
  request: Pick<DataRequest, 'accountsWithSupportedChains' | 'chainIds'>;
};

/**
 * Assets the price poll should price: saved balances and custom assets,
 * excluding hidden assets. Scoped to the request's accounts and chains.
 * Balance rows are what a fetch leaves visible (holdings, plus native, pins,
 * and default tracked assets at zero). Metadata with no balance is not priced.
 *
 * The balance-refresh middleware does not use this. It prices response
 * balances through {@link getUnpricedResponseAssetIds}.
 *
 * @param params - State and request scope.
 * @param params.state - Controller state slices used for candidate collection.
 * @param params.request - Account and chain scope for the fetch.
 * @returns Deduplicated, checksummed CAIP-19 asset IDs.
 */
export function getAssetIdsForPriceFetch({
  state,
  request,
}: GetAssetIdsForPriceFetchParams): Set<Caip19AssetId> {
  const assetIds = new Set<Caip19AssetId>();
  const hiddenAssetIds = collectHiddenAssetIdKeys(state.assetPreferences);
  const accountFilter = buildAccountFilter(request);
  const chainFilter = buildChainFilter(request);
  const addAssetId = (assetId: string): void => {
    addStoredAssetId(assetId, assetIds, chainFilter, hiddenAssetIds);
  };

  addBalancesFromAccounts(state.assetsBalance, accountFilter, addAssetId);
  addCustomAssets(state.customAssets, accountFilter, addAssetId);

  return assetIds;
}

export type GetResponseAssetIdsForPriceFetchParams = {
  /** Current pipeline response balances. Already scoped to the request. */
  response: Pick<DataResponse, 'assetsBalance'>;
};

/**
 * Asset IDs on the current response balances. Balance sources already limit
 * the response to the request and write ids in the form stored prices use.
 *
 * @param params - Response balances.
 * @param params.response - Current pipeline response balances.
 * @returns Deduplicated, checksummed CAIP-19 asset IDs.
 */
export function getResponseAssetIdsForPriceFetch({
  response,
}: GetResponseAssetIdsForPriceFetchParams): Set<Caip19AssetId> {
  const assetIds = new Set<Caip19AssetId>();
  for (const accountBalances of Object.values(response.assetsBalance ?? {})) {
    for (const assetId of Object.keys(accountBalances)) {
      try {
        assetIds.add(normalizeAssetId(assetId as Caip19AssetId));
      } catch (error) {
        log('Skipping malformed asset ID for price fetch', { assetId, error });
      }
    }
  }
  return assetIds;
}

export type GetUnpricedResponseAssetIdsParams =
  GetResponseAssetIdsForPriceFetchParams & {
    /** Hidden preferences and stored prices. */
    state: Pick<AssetsControllerState, 'assetPreferences' | 'assetsPrice'>;
    /**
     * Loads chains the price API can price. Called only when a priceable
     * response balance remains. An empty set keeps every remaining asset.
     */
    getSupportedNetworks: () => Promise<Set<string>>;
  };

/**
 * Response balances the balance-refresh middleware should price.
 *
 * Hidden assets are excluded, then non-priceable assets, assets on chains the
 * price API does not support, and assets that already have a stored price.
 *
 * @param params - State, response balances, and network lookup.
 * @param params.state - Hidden preferences and stored prices.
 * @param params.response - Current pipeline response balances.
 * @param params.getSupportedNetworks - Loads chains the price API can price.
 * @returns Asset IDs that still need a price.
 */
export async function getUnpricedResponseAssetIds({
  state,
  response,
  getSupportedNetworks,
}: GetUnpricedResponseAssetIdsParams): Promise<Caip19AssetId[]> {
  const hiddenAssetIds = collectHiddenAssetIdKeys(state.assetPreferences);
  const priceableAssetIds = [
    ...getResponseAssetIdsForPriceFetch({ response }),
  ].filter(
    (assetId) => !hiddenAssetIds.has(assetId) && isPriceableAsset(assetId),
  );
  if (priceableAssetIds.length === 0) {
    return [];
  }

  const supportedNetworks = await getSupportedNetworks();
  return filterAssetsMissingPrice(
    filterAssetsBySupportedNetworks(priceableAssetIds, supportedNetworks),
    state.assetsPrice,
  );
}

/**
 * Keeps asset IDs whose chain is in `supportedNetworks`.
 *
 * @param assetIds - CAIP-19 asset IDs.
 * @param supportedNetworks - Supported CAIP-2 chain IDs.
 * @returns Matching IDs, or all IDs if the set is empty.
 */
export function filterAssetsBySupportedNetworks(
  assetIds: Caip19AssetId[],
  supportedNetworks: Set<string>,
): Caip19AssetId[] {
  if (supportedNetworks.size === 0) {
    return assetIds;
  }
  return assetIds.filter((assetId) => {
    try {
      const parsed = parseCaipAssetType(assetId);
      const chainId = `${parsed.chain.namespace}:${parsed.chain.reference}`;
      return supportedNetworks.has(chainId);
    } catch {
      return false;
    }
  });
}

/**
 * Keep asset IDs that have no stored price.
 *
 * @param assetIds - CAIP-19 asset IDs from the response.
 * @param storedPrices - Prices already in controller state.
 * @returns IDs with no entry under that id.
 */
function filterAssetsMissingPrice(
  assetIds: Caip19AssetId[],
  storedPrices: AssetsControllerState['assetsPrice'] | undefined,
): Caip19AssetId[] {
  const prices = storedPrices ?? {};
  return assetIds.filter((assetId) => prices[assetId] === undefined);
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
 * Ids of assets the user has marked hidden. Preferences in state are stored
 * checksummed, same as balances and prices.
 *
 * @param assetPreferences - Preference map from controller state.
 * @returns Set of hidden CAIP-19 asset IDs.
 */
function collectHiddenAssetIdKeys(
  assetPreferences: AssetsControllerState['assetPreferences'] | undefined,
): Set<Caip19AssetId> {
  return new Set(
    Object.entries(assetPreferences ?? {})
      .filter(([, preferences]) => preferences.hidden)
      .map(([assetId]) => normalizeAssetId(assetId as Caip19AssetId)),
  );
}

/**
 * Checksum `assetId`, then keep it when it is in chain scope and not hidden.
 * An id that fails checksumming is skipped. {@link normalizeAssetId} is
 * memoized, so an id that is already checksummed is cheap.
 *
 * @param assetId - Candidate CAIP-19 asset ID.
 * @param assetIds - Collected ids.
 * @param chainFilter - Optional allowed chain IDs.
 * @param hiddenAssetIds - Hidden asset IDs from state.
 */
function addStoredAssetId(
  assetId: string,
  assetIds: Set<Caip19AssetId>,
  chainFilter: Set<string> | undefined,
  hiddenAssetIds: Set<Caip19AssetId>,
): void {
  try {
    const id = normalizeAssetId(assetId as Caip19AssetId);
    if (hiddenAssetIds.has(id)) {
      return;
    }
    const { chainId } = parseCaipAssetType(id);
    if (chainFilter && !chainFilter.has(chainId)) {
      return;
    }
    assetIds.add(id);
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
