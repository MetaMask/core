import {
  ChainId as ControllerChainId,
  convertHexToDecimal,
} from '@metamask/controller-utils';

import type { ChainId, TokenListEntry } from '../types/index.js';

/**
 * Same host + path that `TokenListController` (assets-controllers) uses
 * (`token-service.ts` → `getTokensURL`). Sharing this endpoint keeps the
 * RPC token detector aligned with the rest of the wallet's token listing
 * (occurrence floors, aggregator filters, icon URLs, etc.).
 */
const TOKEN_END_POINT_API = 'https://token.api.cx.metamask.io';

/**
 * Endpoint that returns which CAIP chain IDs the Tokens API supports.
 * Used to skip detection (and avoid unnecessary network requests) for chains
 * that are not in the supported-networks list.
 */
const SUPPORTED_NETWORKS_URL = `${TOKEN_END_POINT_API}/v2/supportedNetworks`;

/**
 * Per-chain suggested occurrence floors used as the `occurrenceFloor` query
 * param when fetching token lists (and aligned with TokenDataSource spam
 * filtering). Keys are decimal chain IDs.
 */
const SUGGESTED_OCCURRENCE_FLOORS_URL = `${TOKEN_END_POINT_API}/v1/suggestedOccurrenceFloors`;

/**
 * Fallback `occurrenceFloor` when `/v1/suggestedOccurrenceFloors` has no entry
 * for the chain, or the floors request fails.
 */
const DEFAULT_OCCURRENCE_FLOOR = 3;

/**
 * How long to keep the supported-networks response in the instance-level
 * cache before refreshing it. One hour is sufficient — the list rarely
 * changes and a stale cache just means we may do an unnecessary token-list
 * fetch for a newly-unsupported chain (harmless).
 */
const SUPPORTED_NETWORKS_CACHE_TTL_MS = 60 * 60_000;

/**
 * How long to keep suggested occurrence floors cached. Same TTL as supported
 * networks — floors change infrequently.
 */
const SUGGESTED_OCCURRENCE_FLOORS_CACHE_TTL_MS = 60 * 60_000;

/**
 * TanStack-Query cache config for the cached `fetchTokenList` path.
 *
 * The Tokens API per-chain list barely changes between polls, so we keep
 * results fresh for a few minutes (`staleTime`) and retain them in cache for
 * an hour (`gcTime`) so re-detections across accounts/chains hit the cache.
 * These tunings only apply when a `queryClient` is provided to the client;
 * the uncached fallback path (used in standalone tests) is unaffected.
 */
const TOKEN_LIST_STALE_TIME_MS = 5 * 60_000;
const TOKEN_LIST_GC_TIME_MS = 60 * 60_000;

/**
 * Shape of the `/v2/supportedNetworks` response.
 */
type SupportedNetworksResponse = {
  fullSupport?: string[];
  partialSupport?: string[];
};

/**
 * Shape of a single item returned by the Tokens API `/tokens/{chainId}`
 * endpoint. Mirrors `TokenListToken` in
 * `packages/assets-controllers/src/TokenListController.ts` and the response
 * parsed by `fetchTokenListByChainId` in `token-service.ts`.
 */
type ApiTokenListItem = {
  address: string;
  symbol?: string;
  name?: string;
  decimals?: number;
  occurrences?: number;
  aggregators?: string[];
  iconUrl?: string;
};

/**
 * Minimal structural type for the TanStack Query client method we use.
 * Avoids a direct dependency on `@tanstack/query-core` while still being
 * fully compatible with the shared `QueryClient` exposed by
 * `ApiPlatformClient.queryClient` (`@metamask/core-backend`).
 */
export type TokenListQueryClient = {
  fetchQuery<TData>(options: {
    queryKey: readonly unknown[];
    queryFn: () => Promise<TData>;
    staleTime?: number;
    gcTime?: number;
  }): Promise<TData>;
};

export type TokensApiClientConfig = {
  /** Fetch function (defaults to globalThis.fetch). */
  fetch?: typeof globalThis.fetch;
  /**
   * Optional TanStack-Query client used to cache token-list responses across
   * detector polls / accounts / instances. When omitted, every call hits the
   * network directly (preserves prior behaviour for tests and standalone use).
   */
  queryClient?: TokenListQueryClient;
};

/**
 * Client for the MetaMask Tokens API.
 *
 * Fetches the per-chain ERC-20 token list from the same endpoint that
 * `TokenListController` uses (`token.api.cx.metamask.io/tokens/{chainId}`),
 * with the same query parameters. The `occurrenceFloor` query param comes from
 * Token API `/v1/suggestedOccurrenceFloors` (fallback {@link DEFAULT_OCCURRENCE_FLOOR}),
 * matching `TokenDataSource` spam filtering. Linea's post-response aggregator
 * filter is still applied client-side.
 *
 * Before fetching a chain's token list, the client checks
 * `/v2/supportedNetworks` and returns `[]` immediately for chains that are
 * not in the supported list, avoiding unnecessary API calls. The supported-
 * networks response is cached in-memory for one hour.
 *
 * When constructed with a `queryClient`, token-list results are cached and
 * deduped via TanStack Query (5 min staleTime, 1 h gcTime), so concurrent
 * detection cycles for the same chain coalesce into a single network request.
 */
export class TokensApiClient {
  readonly #fetch: typeof globalThis.fetch;

  readonly #queryClient: TokenListQueryClient | undefined;

  /** CAIP chain IDs returned by `/v2/supportedNetworks` (both tiers). */
  #supportedChainIds: Set<string> | undefined;

  /** Timestamp of the last successful `/v2/supportedNetworks` fetch. */
  #supportedChainIdsCachedAt = 0;

  /**
   * In-flight `/v2/supportedNetworks` request shared across concurrent callers
   * so only one network request is made even when multiple `fetchTokenList`
   * calls arrive before the first one resolves.
   */
  #supportedChainIdsRefreshPromise: Promise<void> | undefined;

  /** Decimal chain ID → suggested occurrence floor from Token API. */
  #suggestedOccurrenceFloors: Record<string, number> | undefined;

  /** Timestamp of the last successful floors fetch. */
  #suggestedOccurrenceFloorsCachedAt = 0;

  /** In-flight floors request shared across concurrent callers. */
  #suggestedOccurrenceFloorsRefreshPromise: Promise<void> | undefined;

  constructor(config?: TokensApiClientConfig) {
    this.#fetch = config?.fetch ?? globalThis.fetch.bind(globalThis);
    this.#queryClient = config?.queryClient;
  }

  /**
   * Fetch the list of ERC-20 tokens for a chain from the Tokens API.
   *
   * Returns `[]` immediately (without hitting the token-list endpoint) when
   * the chain is not in the `/v2/supportedNetworks` response, or when the
   * supported-networks check fails for any reason.
   *
   * @param hexChainId - Chain ID in hex format (e.g. `'0x1'` for Ethereum mainnet).
   * @returns Array of token list entries with address and metadata, or an empty
   * array if the chain is unsupported or the request fails.
   */
  async fetchTokenList(hexChainId: ChainId): Promise<TokenListEntry[]> {
    // Treat any error from the supported-networks check as "not supported":
    // the token-list endpoint is only contacted for known-supported chains.
    if (!(await this.#isSupportedChain(hexChainId).catch(() => false))) {
      return [];
    }

    const queryClient = this.#queryClient;
    if (queryClient === undefined) {
      return this.#fetchTokenListUncached(hexChainId);
    }

    return queryClient.fetchQuery({
      // Namespacing keeps this key from colliding with other clients that
      // share the same QueryClient (e.g. core-backend's ApiPlatformClient).
      queryKey: [
        'assets-controller',
        'rpc-detection',
        'token-list',
        { chainId: hexChainId },
      ],
      queryFn: () => this.#fetchTokenListUncached(hexChainId),
      staleTime: TOKEN_LIST_STALE_TIME_MS,
      gcTime: TOKEN_LIST_GC_TIME_MS,
    });
  }

  /**
   * Check whether the given chain is present in the supported-networks list.
   *
   * Uses an instance-level cache (1 h TTL). Throws if the network request
   * fails — callers should handle this (e.g. via `.catch(() => false)`).
   *
   * @param hexChainId - Hex chain ID to check.
   * @returns `true` when the chain is in the supported-networks list.
   */
  async #isSupportedChain(hexChainId: ChainId): Promise<boolean> {
    const now = Date.now();
    if (
      this.#supportedChainIds === undefined ||
      now - this.#supportedChainIdsCachedAt >= SUPPORTED_NETWORKS_CACHE_TTL_MS
    ) {
      await this.#refreshSupportedChainIds(now);
    }

    const caipChainId = `eip155:${convertHexToDecimal(hexChainId)}`;
    return this.#supportedChainIds?.has(caipChainId) ?? false;
  }

  /**
   * Fetch `/v2/supportedNetworks` and update the instance cache.
   * Concurrent callers share the same in-flight Promise so only one network
   * request is made. If the response is not 2xx the cache is left unchanged
   * (the chain will be treated as unsupported this cycle).
   *
   * @param now - Current timestamp used to stamp the cache entry.
   * @returns A promise that resolves once the cache has been refreshed.
   */
  async #refreshSupportedChainIds(now: number): Promise<void> {
    if (this.#supportedChainIdsRefreshPromise !== undefined) {
      return this.#supportedChainIdsRefreshPromise;
    }

    this.#supportedChainIdsRefreshPromise = (async (): Promise<void> => {
      try {
        const response = await this.#fetch(SUPPORTED_NETWORKS_URL);
        if (response.ok) {
          const data = (await response.json()) as SupportedNetworksResponse;
          this.#supportedChainIds = new Set([
            ...(data.fullSupport ?? []),
            ...(data.partialSupport ?? []),
          ]);
          this.#supportedChainIdsCachedAt = now;
        }
      } finally {
        this.#supportedChainIdsRefreshPromise = undefined;
      }
    })();

    return this.#supportedChainIdsRefreshPromise;
  }

  /**
   * Resolve the `occurrenceFloor` query param for a chain from Token API
   * `/v1/suggestedOccurrenceFloors`. Falls back to
   * {@link DEFAULT_OCCURRENCE_FLOOR} when the chain is missing or the request
   * fails.
   *
   * @param hexChainId - Hex chain ID.
   * @returns Occurrence floor to send to `/tokens/{chainId}`.
   */
  async #getOccurrenceFloor(hexChainId: ChainId): Promise<number> {
    const now = Date.now();
    if (
      this.#suggestedOccurrenceFloors === undefined ||
      now - this.#suggestedOccurrenceFloorsCachedAt >=
        SUGGESTED_OCCURRENCE_FLOORS_CACHE_TTL_MS
    ) {
      await this.#refreshSuggestedOccurrenceFloors(now);
    }

    const decimalChainId = String(convertHexToDecimal(hexChainId));
    return (
      this.#suggestedOccurrenceFloors?.[decimalChainId] ??
      DEFAULT_OCCURRENCE_FLOOR
    );
  }

  /**
   * Fetch `/v1/suggestedOccurrenceFloors` and update the instance cache.
   * Concurrent callers share the in-flight Promise. Failures leave the cache
   * empty so {@link #getOccurrenceFloor} falls back to the default.
   *
   * @param now - Current timestamp used to stamp the cache entry.
   * @returns A promise that resolves once the cache has been refreshed.
   */
  async #refreshSuggestedOccurrenceFloors(now: number): Promise<void> {
    if (this.#suggestedOccurrenceFloorsRefreshPromise !== undefined) {
      return this.#suggestedOccurrenceFloorsRefreshPromise;
    }

    this.#suggestedOccurrenceFloorsRefreshPromise =
      (async (): Promise<void> => {
        try {
          const response = await this.#fetch(SUGGESTED_OCCURRENCE_FLOORS_URL);
          if (response.ok) {
            const data = (await response.json()) as Record<string, number>;
            this.#suggestedOccurrenceFloors =
              data && typeof data === 'object' && !Array.isArray(data)
                ? data
                : {};
            this.#suggestedOccurrenceFloorsCachedAt = now;
          } else {
            this.#suggestedOccurrenceFloors = {};
            this.#suggestedOccurrenceFloorsCachedAt = now;
          }
        } catch {
          this.#suggestedOccurrenceFloors = {};
          this.#suggestedOccurrenceFloorsCachedAt = now;
        } finally {
          this.#suggestedOccurrenceFloorsRefreshPromise = undefined;
        }
      })();

    return this.#suggestedOccurrenceFloorsRefreshPromise;
  }

  async #fetchTokenListUncached(
    hexChainId: ChainId,
  ): Promise<TokenListEntry[]> {
    const decimalChainId = convertHexToDecimal(hexChainId);
    const occurrenceFloor = await this.#getOccurrenceFloor(hexChainId);

    // Same query shape as `TokenListController.getTokensURL` (token-service.ts),
    // but `occurrenceFloor` comes from `/v1/suggestedOccurrenceFloors`.
    // No `first=...` cap — the API returns the full per-chain list bounded
    // server-side by `occurrenceFloor`.
    const url =
      `${TOKEN_END_POINT_API}/tokens/${decimalChainId}` +
      `?occurrenceFloor=${occurrenceFloor}` +
      `&includeNativeAssets=false` +
      `&includeTokenFees=false` +
      `&includeAssetType=false` +
      `&includeERC20Permit=false` +
      `&includeStorage=false` +
      `&includeRwaData=true`;

    let response: Response;
    try {
      response = await this.#fetch(url);
    } catch (error) {
      console.error(
        `Tokens API request failed for chain ${hexChainId}:`,
        error,
      );
      return [];
    }

    if (!response.ok) {
      console.error(
        `Tokens API responded with ${response.status} for chain ${hexChainId}`,
      );
      return [];
    }

    const raw = (await response.json()) as unknown;
    const items: ApiTokenListItem[] = Array.isArray(raw)
      ? (raw as ApiTokenListItem[])
      : [];

    const filtered = applyChainSpecificFilters(hexChainId, items);

    return filtered.map((item) => ({
      address: item.address,
      symbol: item.symbol ?? '',
      name: item.name ?? '',
      decimals: item.decimals ?? 18,
      iconUrl: item.iconUrl,
      aggregators: item.aggregators,
      occurrences: item.occurrences,
    }));
  }
}

/**
 * Apply chain-specific filters to a raw token list response, mirroring
 * `fetchTokenListByChainId` in `assets-controllers/src/token-service.ts`.
 *
 * For Linea mainnet, the API returns extras with low aggregator coverage, so
 * we keep only entries flagged by Linea's own team or seen by ≥3 aggregators.
 *
 * @param hexChainId - Hex chain ID.
 * @param items - Raw items from the API response.
 * @returns Items after chain-specific filtering.
 */
function applyChainSpecificFilters(
  hexChainId: ChainId,
  items: ApiTokenListItem[],
): ApiTokenListItem[] {
  if (hexChainId === ControllerChainId['linea-mainnet']) {
    return items.filter((item) => {
      const aggregators = item.aggregators ?? [];
      return aggregators.includes('lineaTeam') || aggregators.length >= 3;
    });
  }
  return items;
}
