import type { V5BalanceItem, V6BalanceItem } from '@metamask/core-backend';
import { ApiPlatformClient } from '@metamask/core-backend';
import type {
  RemoteFeatureFlagControllerGetStateAction,
  RemoteFeatureFlagControllerStateChangeEvent,
} from '@metamask/remote-feature-flag-controller';
import type { Json } from '@metamask/utils';
import {
  isCaipChainId,
  KnownCaipNamespace,
  parseCaipAssetType,
  toCaipChainId,
} from '@metamask/utils';

import type { AssetsControllerMessenger } from '../AssetsController.js';
import { projectLogger, createModuleLogger } from '../logger.js';
import type {
  ChainId,
  Caip19AssetId,
  AssetBalance,
  DataRequest,
  DataResponse,
  Middleware,
  AssetsControllerStateInternal,
} from '../types.js';
import type { GetAssetVisibility } from '../utils/assetVisibility.js';
import { filterFailedChainBalances } from '../utils/filterFailedChainBalances.js';
import { fetchWithTimeout, normalizeAssetId } from '../utils/index.js';
import {
  getMigrationStages,
  shouldSupportChain,
} from '../utils/snaps-assets-migration.js';
import type {
  DataSourceState,
  SubscriptionRequest,
} from './AbstractDataSource.js';
import { AbstractDataSource } from './AbstractDataSource.js';
import { isStakingContractAssetId } from './evm-rpc-services/index.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const CONTROLLER_NAME = 'AccountsApiDataSource';
const DEFAULT_POLL_INTERVAL = 30_000;
const DEFAULT_FETCH_TIMEOUT_MS = 15_000;

const log = createModuleLogger(projectLogger, CONTROLLER_NAME);

// ============================================================================
// MESSENGER TYPES
// ============================================================================

// Allowed actions that AccountsApiDataSource can call. Balances are fetched via
// ApiPlatformClient directly (no BackendApiClient actions needed); the messenger
// is used to subscribe to `RemoteFeatureFlagController:stateChange` (see
// constructor) so migration flag changes refresh the active chains, and to
// read those flags when listing active chains.
export type AccountsApiDataSourceAllowedActions =
  RemoteFeatureFlagControllerGetStateAction;

// Allowed events that AccountsApiDataSource subscribes to. Migration flag
// changes trigger a refresh of the chains surfaced as active.
export type AccountsApiDataSourceAllowedEvents =
  RemoteFeatureFlagControllerStateChangeEvent;

// ============================================================================
// STATE
// ============================================================================

export type AccountsApiDataSourceState = DataSourceState;

const defaultState: AccountsApiDataSourceState = {
  activeChains: [],
};

// ============================================================================
// OPTIONS
// ============================================================================

/** Optional configuration for AccountsApiDataSource. */
export type AccountsApiDataSourceConfig = {
  /** Polling interval in ms (default: 30000) */
  pollInterval?: number;
  /**
   * Function returning whether token detection is enabled (default: () => true).
   * When it returns false, balances are only returned for tokens already in state.
   * Using a getter avoids stale values when the user toggles the preference at runtime.
   */
  tokenDetectionEnabled?: () => boolean;
  /**
   * Timeout in ms for a single balances fetch call (default: 15000).
   * When it fires, every requested chain is marked as errored so the
   * middleware hands them off to the next data source (e.g. RPC fallback).
   */
  fetchTimeoutMs?: number;
};

export type AccountsApiDataSourceOptions = AccountsApiDataSourceConfig & {
  /**
   * The AssetsController messenger (shared by all data sources). Used to read
   * Snaps → AssetsController migration flags and subscribe to flag changes.
   */
  messenger: AssetsControllerMessenger;
  /** ApiPlatformClient for API calls with caching */
  queryApiClient: ApiPlatformClient;
  /** Called when active chains are updated. Pass dataSourceName so the controller knows the source. */
  onActiveChainsUpdated: (
    dataSourceName: string,
    chains: ChainId[],
    previousChains: ChainId[],
  ) => void;
  /**
   * Whether to use the Accounts API v6 balances endpoint (and `includeAssetIds`).
   * Injected by AssetsController so the flag is read in one place. Defaults to
   * `false` (v5). Read on demand, not cached.
   */
  isBalanceV6Enabled?: () => boolean;
  /**
   * Current AssetsController state. Used for v6 include/exclude asset IDs and
   * for filtering when token detection is off.
   */
  getAssetsState: () => AssetsControllerStateInternal;
  /** Returns shared visible/hidden assets for an account/chain scope. */
  getAssetVisibility: GetAssetVisibility;
  state?: Partial<AccountsApiDataSourceState>;
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function decimalToChainId(decimalChainId: number | string): ChainId {
  // Handle both decimal numbers and already-formatted CAIP chain IDs
  if (typeof decimalChainId === 'string') {
    if (isCaipChainId(decimalChainId)) {
      return decimalChainId;
    }
    return toCaipChainId(KnownCaipNamespace.Eip155, decimalChainId);
  }
  return toCaipChainId(KnownCaipNamespace.Eip155, String(decimalChainId));
}

/**
 * Collect chain ids from Accounts API `/v2/supportedNetworks`.
 *
 * `fullSupport` and `partialSupport` are CAIP-2 arrays. The older
 * `{ balances: number[] }` `partialSupport` object is still read so mixed
 * deploys keep working until every environment has rolled forward.
 *
 * @param response - The v2 supported-networks payload.
 * @param response.fullSupport - Fully supported chain ids (CAIP-2 or decimals).
 * @param response.partialSupport - Partially supported chain ids, as a CAIP-2
 * array or legacy `{ balances }` object.
 * @returns Unique normalized chain ids, `fullSupport` first then `partialSupport`.
 */
function collectSupportedNetworkIds(response: {
  fullSupport?: (number | string)[];
  partialSupport?: (number | string)[] | { balances?: (number | string)[] };
}): ChainId[] {
  const fullSupport = response.fullSupport ?? [];
  const { partialSupport } = response;
  const partialIds = Array.isArray(partialSupport)
    ? partialSupport
    : (partialSupport?.balances ?? []);

  return [
    ...new Set(
      [...fullSupport, ...partialIds].map((rawChainId) =>
        decimalToChainId(rawChainId),
      ),
    ),
  ];
}

/**
 * Convert a CAIP-2 chain ID from the API response to our ChainId type.
 * Handles both formats: "eip155:1" or just "1" (decimal).
 * Uses @metamask/utils for CAIP parsing.
 *
 * @param chainIdStr - The chain ID string to convert.
 * @returns The normalized ChainId.
 */
function caipChainIdToChainId(chainIdStr: string): ChainId {
  if (isCaipChainId(chainIdStr)) {
    return chainIdStr;
  }
  return toCaipChainId(KnownCaipNamespace.Eip155, chainIdStr);
}

/**
 * Filter a response to only include balances for assets already in state.
 * Used when tokenDetectionEnabled is false to prevent adding new tokens.
 *
 * @param response - The fetch response to filter.
 * @param assetsState - Current assets controller state to check existing balances against.
 * @returns A new response with only known asset balances.
 */
export function filterResponseToKnownAssets(
  response: DataResponse,
  assetsState: AssetsControllerStateInternal,
): DataResponse {
  if (!response.assetsBalance) {
    return response;
  }

  const filteredBalance: Record<
    string,
    Record<Caip19AssetId, AssetBalance>
  > = {};

  for (const [accountId, accountBalances] of Object.entries(
    response.assetsBalance,
  )) {
    const existingBalances = assetsState.assetsBalance[accountId];
    if (!existingBalances) {
      // Account has no balances in state yet — skip all its tokens
      continue;
    }

    const filtered: Record<Caip19AssetId, AssetBalance> = {};
    for (const [assetId, balance] of Object.entries(accountBalances)) {
      // Only include assets already tracked in state
      if (assetId in existingBalances) {
        filtered[assetId as Caip19AssetId] = balance;
      }
    }

    if (Object.keys(filtered).length > 0) {
      filteredBalance[accountId] = filtered;
    }
  }

  return {
    ...response,
    assetsBalance:
      Object.keys(filteredBalance).length > 0 ? filteredBalance : undefined,
  };
}

// ============================================================================
// ACCOUNTS API DATA SOURCE
// ============================================================================

/**
 * Data source for fetching balances from the MetaMask Accounts API.
 *
 * Uses ApiPlatformClient (queryApiClient) for all API calls. Does not use the
 * messenger. Reports active chains via onActiveChainsUpdated callback.
 */
export class AccountsApiDataSource extends AbstractDataSource<
  typeof CONTROLLER_NAME,
  AccountsApiDataSourceState
> {
  readonly #onActiveChainsUpdated: (
    dataSourceName: string,
    chains: ChainId[],
    previousChains: ChainId[],
  ) => void;

  readonly #pollInterval: number;

  readonly #fetchTimeoutMs: number;

  /** Getter avoids stale value when user toggles token detection at runtime. */
  readonly #tokenDetectionEnabled: () => boolean;

  /** Shared AssetsController messenger, used to read remote feature flags. */
  readonly #messenger: AssetsControllerMessenger;

  /** Injected by AssetsController; `true` when the v6 balances endpoint should be used. */
  readonly #isBalanceV6Enabled: () => boolean;

  readonly #getAssetsState: () => AssetsControllerStateInternal;

  readonly #getAssetVisibility: GetAssetVisibility;

  /** ApiPlatformClient for cached API calls */
  readonly #apiClient: ApiPlatformClient;

  /** Chains refresh timer */
  #chainsRefreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: AccountsApiDataSourceOptions) {
    super(CONTROLLER_NAME, {
      ...defaultState,
      ...options.state,
    });

    this.#onActiveChainsUpdated = options.onActiveChainsUpdated;
    this.#pollInterval = options.pollInterval ?? DEFAULT_POLL_INTERVAL;
    this.#fetchTimeoutMs = options.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
    this.#tokenDetectionEnabled =
      options.tokenDetectionEnabled ?? ((): boolean => true);
    this.#messenger = options.messenger;
    this.#isBalanceV6Enabled =
      options.isBalanceV6Enabled ?? ((): boolean => false);
    this.#getAssetsState = options.getAssetsState;
    this.#getAssetVisibility = options.getAssetVisibility;
    this.#apiClient = options.queryApiClient;

    // The Snaps → AssetsController migration flags gate which migration networks
    // (Solana, Stellar, Tron) are surfaced as active chains (see
    // `#shouldSupportChain`). Mirror core-backend's AccountActivityService and
    // react to remote feature flag changes so newly-enabled chains are picked up
    // (and disabled ones dropped) without waiting for the periodic refresh.
    this.#messenger.subscribe(
      'RemoteFeatureFlagController:stateChange',
      // Promise result intentionally not awaited
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async () => await this.#handleMigrationFeatureFlagsChanged(),
      // Only react to changes in the set of migration stages. The messenger
      // compares selector results with strict equality, so the selector must
      // return a primitive rather than a fresh object.
      (state) => getMigrationStages(state.remoteFeatureFlags).join(','),
    );

    this.#initializeActiveChains().catch(console.error);
  }

  /**
   * Handle a change to the Snaps → AssetsController migration flags: re-fetch
   * active chains so newly-enabled migration networks are surfaced (and disabled
   * ones dropped) without waiting for the periodic refresh. The refresh invokes
   * `onActiveChainsUpdated` when the set changes, which drives re-subscription.
   */
  async #handleMigrationFeatureFlagsChanged(): Promise<void> {
    try {
      await this.#refreshActiveChains();
    } catch (error) {
      log('Failed to refresh active chains after feature flag change', {
        error,
      });
    }
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async #initializeActiveChains(): Promise<void> {
    try {
      const chains = await this.#fetchActiveChains();
      const previous = [...this.state.activeChains];
      this.updateActiveChains(chains, (updatedChains) =>
        this.#onActiveChainsUpdated(this.getName(), updatedChains, previous),
      );

      // Periodically refresh active chains (every 20 minutes)
      this.#chainsRefreshTimer = setInterval(
        () => {
          this.#refreshActiveChains().catch(console.error);
        },
        20 * 60 * 1000,
      );
    } catch (error) {
      log('Failed to fetch active chains', error);
    }
  }

  async #refreshActiveChains(): Promise<void> {
    try {
      const chains = await this.#fetchActiveChains();
      const previousChains = new Set(this.state.activeChains);
      const newChains = new Set(chains);

      // Check if chains changed
      const added = chains.filter((chain) => !previousChains.has(chain));
      const removed = Array.from(previousChains).filter(
        (chain) => !newChains.has(chain),
      );

      if (added.length > 0 || removed.length > 0) {
        const previous = [...this.state.activeChains];
        this.updateActiveChains(chains, (updatedChains) =>
          this.#onActiveChainsUpdated(this.getName(), updatedChains, previous),
        );
      }
    } catch (error) {
      log('Failed to refresh active chains', error);
    }
  }

  /**
   * Re-fetch supported networks from the Accounts API and update `activeChains`
   * when the list changed. Used when the selected EVM network switches so
   * chain claiming is not stuck on an empty init-time list.
   *
   * @returns Resolves when supported networks have been re-fetched.
   */
  refreshActiveChains(): Promise<void> {
    return this.#refreshActiveChains();
  }

  async #fetchActiveChains(): Promise<ChainId[]> {
    const response = await this.#apiClient.accounts.fetchV2SupportedNetworks();

    // Use fullSupport and partialSupport as active chains, gated by the
    // Snaps → AssetsController migration FF: non-migration namespaces
    // (e.g. `eip155`) are always surfaced, while migration networks (Solana,
    // Stellar, Tron) are only surfaced once their per-network stage reaches
    // ReadAssetsControllerWithFallback.
    const { remoteFeatureFlags } = this.#messenger.call(
      'RemoteFeatureFlagController:getState',
    );
    return collectSupportedNetworkIds(response).filter((chainId) =>
      shouldSupportChain(chainId, remoteFeatureFlags),
    );
  }

  // ============================================================================
  // ACCOUNT SCOPE HELPERS
  // ============================================================================

  // ============================================================================
  // FETCH
  // ============================================================================

  async fetch(request: DataRequest): Promise<DataResponse> {
    if (this.#isBalanceV6Enabled()) {
      return this.#fetchV6(request);
    }

    return this.#fetchV5(request);
  }

  /**
   * v5 fetch. Unchanged from the pre-v6 handler; delete the v6 sibling first
   * if `assetsAccountsApiV6` is rolled back.
   *
   * @param request - The data request.
   * @returns Balances stamped `merge`, plus errors for chains the API could
   * not process.
   */
  async #fetchV5(request: DataRequest): Promise<DataResponse> {
    let response: DataResponse = {};
    const chainsToFetch = this.#getChainsToFetch(request);

    if (chainsToFetch.length === 0) {
      this.#markUnsupportedChains(response, request);
      return response;
    }

    try {
      const accountIds = this.#buildAccountIds(request, chainsToFetch);

      // Skip API call if no valid account-chain combinations
      if (accountIds.length === 0) {
        return response;
      }

      const { unprocessedNetworks, assetsBalance } =
        await this.#fetchV5Balances(
          accountIds,
          this.#buildFetchOptions(request),
          request,
        );

      // Handle unprocessed networks - these will be passed to next middleware
      if (unprocessedNetworks.length > 0) {
        const unprocessedChainIds =
          unprocessedNetworks.map(caipChainIdToChainId);

        // Add unprocessed chains to errors so middleware passes them to next data source
        response.errors = response.errors ?? {};
        for (const chainId of unprocessedChainIds) {
          response.errors[chainId] = 'Unprocessed by Accounts API';
        }
      }

      response.assetsBalance = assetsBalance;
      response.updateMode = 'merge';
    } catch (error) {
      this.#markFetchFailure(response, chainsToFetch, error);
    }

    this.#markUnsupportedChains(response, request);

    // When token detection is disabled, filter out tokens not already in state
    if (!this.#tokenDetectionEnabled()) {
      response = filterResponseToKnownAssets(response, this.#getAssetsState());
    }

    return response;
  }

  /**
   * v6 fetch. Reads visibility from state, sends it as `includeAssetIds` /
   * `excludeAssetIds`, and stamps `full`. A chain the API left unprocessed, or
   * answered without every requested `includeAssetId`, is reported in `errors`
   * and contributes no balances, so the RPC fallback can recover it.
   *
   * @param request - The data request.
   * @returns An authoritative snapshot for the chains that succeeded.
   */
  async #fetchV6(request: DataRequest): Promise<DataResponse> {
    const response: DataResponse = {};
    const chainsToFetch = this.#getChainsToFetch(request);

    if (chainsToFetch.length === 0) {
      this.#markUnsupportedChains(response, request);
      return response;
    }

    try {
      const accountIds = this.#buildAccountIds(request, chainsToFetch);

      if (accountIds.length === 0) {
        return response;
      }

      const { visibleAssetIds, hiddenAssetIds } = this.#getAssetVisibility(
        request.accountsWithSupportedChains.map(({ account }) => account.id),
        chainsToFetch,
      );

      const { unprocessedNetworks, unprocessedIncludeAssetIds, assetsBalance } =
        await this.#fetchV6Balances(
          accountIds,
          this.#buildFetchOptions(request),
          request,
          visibleAssetIds.length > 0 ? visibleAssetIds : undefined,
          hiddenAssetIds.length > 0 ? hiddenAssetIds : undefined,
        );
      response.updateMode = 'full';

      const unprocessedChainIds = unprocessedNetworks.map(caipChainIdToChainId);
      // Chains answered without every requested `includeAssetIds`. The
      // snapshot is incomplete, so the chain counts as failed rather than
      // silently dropping the assets it left out.
      const incompleteChainIds = this.#getChainIdsForAssetIds(
        unprocessedIncludeAssetIds,
      );
      const failedChainIds = new Set<ChainId>([
        ...unprocessedChainIds,
        ...incompleteChainIds,
      ]);

      // Errors hand these chains to the next middleware (the RPC fallback).
      if (failedChainIds.size > 0) {
        response.errors = response.errors ?? {};
        for (const chainId of unprocessedChainIds) {
          response.errors[chainId] = 'Unprocessed by Accounts API';
        }
        for (const chainId of incompleteChainIds) {
          response.errors[chainId] ??= 'Unresolved includeAssetIds';
        }
      }

      // A failed chain contributes nothing, so its balances stay as they are.
      response.assetsBalance = filterFailedChainBalances(
        assetsBalance,
        failedChainIds,
      );
    } catch (error) {
      this.#markFetchFailure(response, chainsToFetch, error);
    }

    this.#markUnsupportedChains(response, request);

    return response;
  }

  /**
   * Requested chains the Accounts API currently supports.
   *
   * @param request - The data request being fetched.
   * @returns The subset of `request.chainIds` this source can answer.
   */
  #getChainsToFetch(request: DataRequest): ChainId[] {
    const supportedChains = new Set(this.state.activeChains);
    return request.chainIds.filter((chainId) => supportedChains.has(chainId));
  }

  /**
   * Mark unsupported chains as errors so they pass to next middleware.
   *
   * @param response - Response being built; mutated in place.
   * @param request - The data request being fetched.
   */
  #markUnsupportedChains(response: DataResponse, request: DataRequest): void {
    const supportedChains = new Set(this.state.activeChains);
    for (const chainId of request.chainIds) {
      if (!supportedChains.has(chainId)) {
        response.errors = response.errors ?? {};
        response.errors[chainId] = 'Chain not supported by Accounts API';
      }
    }
  }

  /**
   * Build CAIP-10 account IDs (e.g., "eip155:1:0x1234...") from the
   * pre-computed supportedChains per account on the request.
   *
   * @param request - The data request being fetched.
   * @param chainsToFetch - Chains this source will ask the API for.
   * @returns One CAIP-10 ID per account-chain combination.
   */
  #buildAccountIds(request: DataRequest, chainsToFetch: ChainId[]): string[] {
    return request.accountsWithSupportedChains.flatMap(
      ({ account, supportedChains: accountChains }) =>
        chainsToFetch
          .filter((chainId) => accountChains.includes(chainId))
          .map((chainId) => `${chainId}:${account.address}`),
    );
  }

  #buildFetchOptions(
    request: DataRequest,
  ):
    | { staleTime: number; gcTime: number; bypassServerCache?: boolean }
    | undefined {
    if (!request.forceUpdate && !request.bypassServerCache) {
      return undefined;
    }

    return {
      staleTime: 0,
      gcTime: 0,
      // Also defeats the API's server-side cache (via a random
      // bypassServerCache query param) so a post-transaction refresh cannot
      // be answered with a pre-transaction snapshot.
      ...(request.bypassServerCache ? { bypassServerCache: true } : {}),
    };
  }

  /**
   * On error, mark all chains as errors so the next middleware handles them.
   *
   * @param response - Response being built; mutated in place.
   * @param chainsToFetch - Chains the failed request covered.
   * @param error - The thrown error.
   */
  #markFetchFailure(
    response: DataResponse,
    chainsToFetch: ChainId[],
    error: unknown,
  ): void {
    log('Fetch FAILED', { error, chains: chainsToFetch });

    response.errors = response.errors ?? {};
    for (const chainId of chainsToFetch) {
      response.errors[chainId] =
        `Fetch failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  #getChainIdsForAssetIds(assetIds: string[]): Set<ChainId> {
    const chainIds = new Set<ChainId>();
    for (const assetId of assetIds) {
      try {
        chainIds.add(parseCaipAssetType(assetId as Caip19AssetId).chainId);
      } catch {
        // An unparseable ID cannot be attributed to a chain, so it cannot
        // invalidate one either.
      }
    }
    return chainIds;
  }

  /**
   * Fetch balances from the legacy v5 endpoint and process them.
   *
   * @param accountIds - CAIP-10 account IDs to fetch balances for.
   * @param fetchOptions - Cache/fetch options (e.g. force update settings).
   * @param request - The original data request containing accounts to map.
   * @returns Unprocessed networks and processed asset balances by account.
   */
  async #fetchV5Balances(
    accountIds: string[],
    fetchOptions:
      | { staleTime: number; gcTime: number; bypassServerCache?: boolean }
      | undefined,
    request: DataRequest,
  ): Promise<{
    unprocessedNetworks: string[];
    unprocessedIncludeAssetIds: string[];
    assetsBalance: Record<string, Record<Caip19AssetId, AssetBalance>>;
  }> {
    const apiResponse = await fetchWithTimeout(
      () =>
        this.#apiClient.accounts.fetchV5MultiAccountBalances(
          accountIds,
          undefined,
          fetchOptions,
        ),
      this.#fetchTimeoutMs,
    );

    const { assetsBalance } = this.#processV5Balances(
      apiResponse.balances,
      request,
    );

    return {
      unprocessedNetworks: apiResponse.unprocessedNetworks,
      // v5 has no `includeAssetIds` support.
      unprocessedIncludeAssetIds: [],
      assetsBalance,
    };
  }

  /**
   * Fetch balances from the v6 endpoint and process them.
   *
   * @param accountIds - CAIP-10 account IDs to fetch balances for.
   * @param fetchOptions - Cache/fetch options (e.g. force update settings).
   * @param request - The original data request containing accounts to map.
   * @param includeAssetIds - Pinned asset IDs the backend must always return.
   * @param excludeAssetIds - Hidden asset IDs the backend must drop.
   * @returns Unprocessed networks, unprocessed pinned assets, and processed
   * asset balances by account.
   */
  async #fetchV6Balances(
    accountIds: string[],
    fetchOptions:
      | { staleTime: number; gcTime: number; bypassServerCache?: boolean }
      | undefined,
    request: DataRequest,
    includeAssetIds: Caip19AssetId[] | undefined,
    excludeAssetIds: Caip19AssetId[] | undefined,
  ): Promise<{
    unprocessedNetworks: string[];
    unprocessedIncludeAssetIds: string[];
    assetsBalance: Record<string, Record<Caip19AssetId, AssetBalance>>;
  }> {
    const params =
      includeAssetIds || excludeAssetIds
        ? {
            ...(includeAssetIds && { includeAssetIds }),
            ...(excludeAssetIds && { excludeAssetIds }),
          }
        : undefined;

    const apiResponse = await fetchWithTimeout(
      () =>
        this.#apiClient.accounts.fetchV6MultiAccountBalances(
          accountIds,
          params,
          fetchOptions,
        ),
      this.#fetchTimeoutMs,
    );

    const { assetsBalance } = this.#processV6Balances(
      apiResponse.balances,
      request,
    );

    return {
      unprocessedNetworks: apiResponse.unprocessedNetworks,
      unprocessedIncludeAssetIds: apiResponse.unprocessedIncludeAssetIds,
      assetsBalance,
    };
  }

  /**
   * Build a lookup of lowercased account address to the request's account ID.
   *
   * @param request - The original data request containing accounts to map.
   * @returns Map of lowercase address to account ID.
   */
  #buildAddressToAccountIdMap(request: DataRequest): Map<string, string> {
    const addressToAccountId = new Map<string, string>();
    for (const { account } of request.accountsWithSupportedChains) {
      if (account.address) {
        addressToAccountId.set(account.address.toLowerCase(), account.id);
      }
    }
    return addressToAccountId;
  }

  /**
   * Process V5 API balances response.
   * V5 returns a flat array of balance items, each with accountId and assetId.
   *
   * @param balances - Array of balance items from the V5 API response.
   * @param request - The original data request containing accounts to map.
   * @returns Object containing processed asset balances by account.
   */
  #processV5Balances(
    balances: V5BalanceItem[],
    request: DataRequest,
  ): {
    assetsBalance: Record<string, Record<Caip19AssetId, AssetBalance>>;
  } {
    const assetsBalance: Record<
      string,
      Record<Caip19AssetId, AssetBalance>
    > = {};

    // Build a map of lowercase addresses to account IDs for efficient lookup
    const addressToAccountId = this.#buildAddressToAccountIdMap(request);

    // V5 response: array of { accountId, assetId, balance, ... }
    for (const item of balances) {
      // Extract address from CAIP-10 account ID (e.g., "eip155:1:0x1234..." -> "0x1234...")
      const addressParts = item.accountId.split(':');
      if (addressParts.length < 3) {
        continue;
      }
      const address = addressParts[2].toLowerCase();

      // Find the matching account ID from request
      const accountId = addressToAccountId.get(address);
      if (!accountId) {
        // This is normal - API returns balances for all chains, but request may only have one account
        continue;
      }

      if (!assetsBalance[accountId]) {
        assetsBalance[accountId] = {};
      }

      // Normalize asset ID (checksum EVM addresses for ERC20 tokens)
      const normalizedAssetId = normalizeAssetId(item.assetId as Caip19AssetId);

      // Staked balances are owned by StakedBalanceDataSource. Accounts API may
      // return the vault share token as a normal ERC-20 (often 0 or stale),
      // which would overwrite or wipe the on-chain staked amount on merge.
      if (isStakingContractAssetId(normalizedAssetId)) {
        continue;
      }

      // Store balance as returned by API, along with any network-specific
      // metadata (e.g. Stellar trustline / native reserve fields).
      assetsBalance[accountId][normalizedAssetId] = {
        amount: item.balance,
        ...(item.metadata ? { metadata: item.metadata } : {}),
      };
    }

    return { assetsBalance };
  }

  /**
   * Process V6 API balances response.
   * V6 returns a flat array of rows carrying their `accountId`.
   * Only `object: 'token'` rows are consumed here to preserve parity with
   * the v5 token-balance behavior; DeFi positions are ignored.
   *
   * @param balances - Flat balance rows from the V6 API response.
   * @param request - The original data request containing accounts to map.
   * @returns Object containing processed asset balances by account.
   */
  #processV6Balances(
    balances: V6BalanceItem[],
    request: DataRequest,
  ): {
    assetsBalance: Record<string, Record<Caip19AssetId, AssetBalance>>;
  } {
    const assetsBalance = Object.create(null) as Record<
      string,
      Record<Caip19AssetId, AssetBalance>
    >;

    // Build a map of lowercase addresses to account IDs for efficient lookup
    const addressToAccountId = this.#buildAddressToAccountIdMap(request);

    for (const item of balances) {
      // Extract address from CAIP-10 account ID (e.g., "eip155:1:0x1234..." -> "0x1234...")
      const addressParts = item.accountId.split(':');
      if (addressParts.length < 3) {
        continue;
      }
      const address = addressParts[2].toLowerCase();

      // Find the matching account ID from request
      const accountId = addressToAccountId.get(address);
      if (!accountId) {
        // This is normal - API returns balances for all chains, but request may only have one account
        continue;
      }

      // Only consume token balances; DeFi positions are handled elsewhere.
      if (item.object !== 'token') {
        continue;
      }

      if (!assetsBalance[accountId]) {
        assetsBalance[accountId] = Object.create(null) as Record<
          Caip19AssetId,
          AssetBalance
        >;
      }

      // Normalize asset ID (checksum EVM addresses for ERC20 tokens)
      const normalizedAssetId = normalizeAssetId(item.assetId as Caip19AssetId);

      // Staked balances are owned by StakedBalanceDataSource. Accounts API may
      // return the vault share token as a normal ERC-20 (often 0 or stale),
      // which would overwrite or wipe the on-chain staked amount on merge.
      if (isStakingContractAssetId(normalizedAssetId)) {
        continue;
      }

      // Store balance as returned by API, along with any network-specific
      // metadata (e.g. Stellar trustline / native reserve fields).
      assetsBalance[accountId][normalizedAssetId] = {
        amount: item.balance,
        ...(item.metadata ? { metadata: item.metadata as Json } : {}),
      };
    }

    return { assetsBalance };
  }

  // ============================================================================
  // MIDDLEWARE
  // ============================================================================

  /**
   * Get the middleware for fetching balances via Accounts API.
   * This middleware:
   * - Supports multiple accounts in a single request
   * - Uses unprocessedNetworks from API response to determine what to pass to next middleware
   * - Merges response into context
   * - Removes handled chains from request for next middleware
   *
   * @returns The middleware function for the assets pipeline.
   */
  get assetsMiddleware(): Middleware {
    if (this.#isBalanceV6Enabled()) {
      return this.#assetsMiddlewareV6;
    }

    return this.#assetsMiddlewareV5;
  }

  readonly #assetsMiddlewareV5: Middleware = async (context, next) => {
    const { request } = context;

    // Price/metadata-only requests must not hit the Accounts API.
    if (!request.dataTypes.includes('balance')) {
      return next(context);
    }

    // If no chains requested, skip to next middleware
    if (request.chainIds.length === 0) {
      return next(context);
    }

    let successfullyHandledChains: ChainId[] = [];

    try {
      const response = await this.fetch(request);

      // Merge response into context
      if (response.assetsBalance) {
        context.response.assetsBalance ??= {};
        for (const [accountId, accountBalances] of Object.entries(
          response.assetsBalance,
        )) {
          context.response.assetsBalance[accountId] = {
            ...context.response.assetsBalance[accountId],
            ...accountBalances,
          };
        }
      }

      // Determine successfully handled chains (exclude unprocessed/error chains)
      const unprocessedChains = new Set(Object.keys(response.errors ?? {}));
      successfullyHandledChains = request.chainIds.filter(
        (chainId) => !unprocessedChains.has(chainId),
      );

      // When token detection is off and we filtered out all balance data (e.g. new
      // account with empty state), do not claim any chain as handled so that RPC
      // middleware can still process them and fetch native balances (ETH, MATIC, etc.).
      if (
        !this.#tokenDetectionEnabled() &&
        (!response.assetsBalance ||
          Object.keys(response.assetsBalance).length === 0)
      ) {
        successfullyHandledChains = [];
      }
    } catch (error) {
      log('Middleware fetch failed', { error });
      successfullyHandledChains = [];
    }

    // Remove successfully handled chains from request for next middleware
    if (successfullyHandledChains.length > 0) {
      const remainingChains = request.chainIds.filter(
        (chainId) => !successfullyHandledChains.includes(chainId),
      );

      return next({
        ...context,
        request: {
          ...request,
          chainIds: remainingChains,
        },
      });
    }

    // No chains handled - pass context unchanged
    return next(context);
  };

  readonly #assetsMiddlewareV6: Middleware = async (context, next) => {
    const { request } = context;

    // Price/metadata-only requests must not hit the Accounts API.
    if (!request.dataTypes.includes('balance')) {
      return next(context);
    }

    // If no chains requested, skip to next middleware
    if (request.chainIds.length === 0) {
      return next(context);
    }

    let remainingChains = request.chainIds;

    try {
      const response = await this.fetch(request);

      // Merge response into context
      if (response.assetsBalance) {
        context.response.assetsBalance ??= {};
        for (const [accountId, accountBalances] of Object.entries(
          response.assetsBalance,
        )) {
          context.response.assetsBalance[accountId] = {
            ...context.response.assetsBalance[accountId],
            ...accountBalances,
          };
        }
      }

      context.response = {
        ...context.response,
        updateMode: 'full',
      };

      const errors = response.errors ?? {};
      remainingChains = request.chainIds.filter((chainId) => errors[chainId]);

      // Remaining chains are exactly the failed ones; RPC fallback retries them.
      if (remainingChains.length > 0) {
        context.response.errors = {
          ...context.response.errors,
          ...Object.fromEntries(
            remainingChains.map((chainId) => [chainId, errors[chainId]]),
          ),
        };
      }
    } catch (error) {
      log('Middleware fetch failed', { error });
      remainingChains = request.chainIds;
    }

    return next({
      ...context,
      request: {
        ...request,
        chainIds: remainingChains,
      },
    });
  };

  // ============================================================================
  // SUBSCRIBE
  // ============================================================================

  async subscribe(subscriptionRequest: SubscriptionRequest): Promise<void> {
    const { request, subscriptionId, isUpdate, skipInitialFetch } =
      subscriptionRequest;

    // Try all requested chains - API will handle unsupported ones via unprocessedNetworks
    const chainsToSubscribe = request.chainIds;

    if (chainsToSubscribe.length === 0) {
      return;
    }

    // Handle subscription update - update both chains AND request (for accounts)
    if (isUpdate) {
      const existing = this.activeSubscriptions.get(subscriptionId);
      if (existing) {
        const previousChains = existing.chains;
        existing.chains = chainsToSubscribe;
        existing.request = request;

        // Chains handed off from another data source (e.g. the websocket
        // source releasing a chain that went down) would otherwise stay
        // stale until the next poll tick — fetch them immediately.
        const addedChains = chainsToSubscribe.filter(
          (chainId) => !previousChains.includes(chainId),
        );
        if (addedChains.length > 0) {
          try {
            const fetchResponse = await this.fetch({
              ...request,
              chainIds: addedChains,
              forceUpdate: true,
            });
            await existing.onAssetsUpdate(fetchResponse);
          } catch (error) {
            log('Initial fetch for added chains failed', {
              subscriptionId,
              addedChains,
              error,
            });
          }
        }
        return;
      }
    }

    // Clean up existing subscription if any
    await this.unsubscribe(subscriptionId);

    const pollInterval = request.updateInterval ?? this.#pollInterval;

    // Create poll function for this subscription
    const pollFn = async (): Promise<void> => {
      try {
        const subscription = this.activeSubscriptions.get(subscriptionId);
        if (!subscription?.request) {
          return;
        }

        // Use stored request (which gets updated on account changes).
        // forceUpdate so we don't get a stale response from the cache
        // (STALE_TIMES.BALANCES is 60s, longer than our 30s poll interval).
        const fetchResponse = await this.fetch({
          ...subscription.request,
          chainIds: subscription.chains,
          forceUpdate: true,
        });

        // Report update to AssetsController via callback
        await subscription.onAssetsUpdate(fetchResponse);
      } catch (error) {
        log('Subscription poll failed', { subscriptionId, error });
      }
    };

    // Set up polling
    const timer = setInterval(() => {
      pollFn().catch(console.error);
    }, pollInterval);

    // Store subscription with request for account updates
    this.activeSubscriptions.set(subscriptionId, {
      cleanup: () => {
        clearInterval(timer);
      },
      chains: chainsToSubscribe,
      request,
      onAssetsUpdate: subscriptionRequest.onAssetsUpdate,
    });

    // Interval above still polls on the normal cadence. This only skips the
    // one-shot fetch at subscribe time when the controller already ran a
    // force getAssets for the same scope (startup / group refresh).
    if (!skipInitialFetch) {
      await pollFn();
    }
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  destroy(): void {
    if (this.#chainsRefreshTimer) {
      clearInterval(this.#chainsRefreshTimer);
    }

    super.destroy();
  }
}
