import {
  ChainId as ControllerChainId,
  convertHexToDecimal,
} from '@metamask/controller-utils';

import type { ChainId, TokenListEntry } from '../types';

/**
 * Same host + path that `TokenListController` (assets-controllers) uses
 * (`token-service.ts` → `getTokensURL`). Sharing this endpoint keeps the
 * RPC token detector aligned with the rest of the wallet's token listing
 * (occurrence floors, aggregator filters, icon URLs, etc.).
 */
const TOKEN_END_POINT_API = 'https://token.api.cx.metamask.io';

/**
 * Tempo Mainnet — not yet present in `@metamask/controller-utils`'s `ChainId`
 * map at the time of writing, so it's spelled out as a literal here exactly as
 * `TokenListController` does (see `token-service.ts:getTokensURL`).
 */
const TEMPO_MAINNET_CHAIN_ID = '0x1079' as const;

/**
 * Per-chain occurrence floor, mirroring `TokenListController.getTokensURL`:
 * Linea mainnet, MegaETH mainnet, and Tempo mainnet have thinner aggregator
 * coverage so we lower the floor; everything else uses the default 3.
 *
 * @param hexChainId - Hex chain ID.
 * @returns The occurrence floor to send to the Tokens API.
 */
function getOccurrenceFloor(hexChainId: ChainId): number {
  if (
    hexChainId === ControllerChainId['linea-mainnet'] ||
    hexChainId === ControllerChainId['megaeth-mainnet'] ||
    hexChainId === TEMPO_MAINNET_CHAIN_ID
  ) {
    return 1;
  }
  return 3;
}

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
 * with the same query parameters and the same per-chain occurrence floor /
 * Linea aggregator filter. This keeps RPC token detection in lockstep with
 * the wallet's primary token list.
 *
 * When constructed with a `queryClient`, results are cached and deduped via
 * TanStack Query (5 min staleTime, 1 h gcTime), so concurrent detection cycles
 * for the same chain coalesce into a single network request.
 */
export class TokensApiClient {
  readonly #fetch: typeof globalThis.fetch;

  readonly #queryClient: TokenListQueryClient | undefined;

  constructor(config?: TokensApiClientConfig) {
    this.#fetch = config?.fetch ?? globalThis.fetch.bind(globalThis);
    this.#queryClient = config?.queryClient;
  }

  /**
   * Fetch the list of ERC-20 tokens for a chain from the Tokens API.
   *
   * @param hexChainId - Chain ID in hex format (e.g. `'0x1'` for Ethereum mainnet).
   * @returns Array of token list entries with address and metadata.
   * @throws If the API responds with a non-2xx status.
   */
  async fetchTokenList(hexChainId: ChainId): Promise<TokenListEntry[]> {
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

  async #fetchTokenListUncached(
    hexChainId: ChainId,
  ): Promise<TokenListEntry[]> {
    const decimalChainId = convertHexToDecimal(hexChainId);
    const occurrenceFloor = getOccurrenceFloor(hexChainId);

    // Mirrors `TokenListController.getTokensURL` exactly (token-service.ts).
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

    const response = await this.#fetch(url);
    if (!response.ok) {
      throw new Error(
        `Tokens API responded with ${response.status} for chain ${hexChainId}`,
      );
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
