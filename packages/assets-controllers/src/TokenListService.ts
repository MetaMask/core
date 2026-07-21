import type { Hex } from '@metamask/utils';
import { QueryClient } from '@tanstack/query-core';

import { formatAggregatorNames, formatIconUrlWithProxy } from './assetsUtil';
import { fetchTokenListByChainId } from './token-service';
import type { TokenListMap, TokenListToken } from './TokenListController';

// 4 hours — mirrors TokenListController's DEFAULT_THRESHOLD
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

/**
 * Shared service for fetching and caching the token list per chain.
 *
 * Callers invoke `fetchTokensByChainId` directly. TanStack Query caches the
 * normalised `TokenListMap` for 4 hours so that multiple controllers share the
 * same in-memory cache without redundant network requests or per-token
 * formatting work on cache hits.
 */
export class TokenListService {
  readonly #queryClient: QueryClient;

  #abortController: AbortController;

  constructor() {
    this.#abortController = new AbortController();
    this.#queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: FOUR_HOURS_MS,
          // fetchQuery never creates an observer, so entries are immediately
          // inactive. Without an explicit gcTime the default 5-minute GC would
          // evict them long before the 4-hour staleTime window expires.
          gcTime: FOUR_HOURS_MS,
          retry: false,
        },
      },
    });
  }

  /**
   * Fetch the token list for a given chain, normalising the raw API response
   * into a `TokenListMap` keyed by lowercase address.
   *
   * Results are cached in-memory for 4 hours. A second call within the cache
   * window returns the cached value without a network request.
   *
   * @param chainId - The hex chain ID to fetch tokens for.
   * @returns A map of lowercase token address → token metadata.
   */
  async fetchTokensByChainId(chainId: Hex): Promise<TokenListMap> {
    const queryKey = ['TokenListService:fetchTokensByChainId', chainId];
    // On failure, TanStack Query v5 sets isInvalidated=true and leaves state.data
    // undefined, so the next fetchQuery call always triggers a fresh network request
    // rather than serving the cached error. No manual cache eviction is needed.
    return this.#queryClient.fetchQuery({
      queryKey,
      queryFn: async () => {
        const list = (await fetchTokenListByChainId(
          chainId,
          this.#abortController.signal,
        )) as TokenListToken[] | undefined;
        return buildTokenListMap(list ?? [], chainId);
      },
      staleTime: FOUR_HOURS_MS,
      gcTime: FOUR_HOURS_MS,
    });
  }

  /**
   * Abort in-flight requests, clear the query cache, and reset the abort
   * controller so subsequent `fetchTokensByChainId` calls are not stuck with an
   * already-aborted signal (which would cache empty results).
   */
  destroy(): void {
    this.#abortController.abort();
    this.#queryClient.clear();
    this.#abortController = new AbortController();
  }
}

/**
 * Normalise a raw token list array (from the token API) into a `TokenListMap`.
 *
 * @param tokens - Raw array of token objects returned by the API.
 * @param chainId - The chain the tokens belong to (used for icon URL proxy).
 * @returns A record keyed by lowercased token address.
 */
export function buildTokenListMap(
  tokens: TokenListToken[],
  chainId: Hex,
): TokenListMap {
  const tokenListMap: TokenListMap = {};
  for (const token of tokens) {
    tokenListMap[token.address.toLowerCase()] = {
      ...token,
      aggregators: formatAggregatorNames(token.aggregators),
      iconUrl: formatIconUrlWithProxy({
        chainId,
        tokenAddress: token.address,
      }),
    };
  }
  return tokenListMap;
}
