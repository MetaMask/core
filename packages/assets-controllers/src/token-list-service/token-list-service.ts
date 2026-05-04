import type { Hex } from '@metamask/utils';

import { fetchAndBuildTokenListMap } from '../token-service';
import type { TokenListMap } from '../TokenListController';

/**
 * How long a cached token list is considered fresh before the next
 * {@link TokenListService.getTokenListForChain} call re-fetches from the API.
 */
export const TOKEN_LIST_STALE_TIME = 4 * 60 * 60 * 1000; // 4 hours

/**
 * A lightweight service that fetches and caches the token list for each chain.
 *
 * Both {@link TokenDetectionController} and {@link TokensController} share a
 * single instance so that parallel calls for the same chain are de-duplicated
 * by the in-flight map and the cached result is re-used across both controllers
 * for up to {@link TOKEN_LIST_STALE_TIME}.
 *
 * @example
 * ```ts
 * const service = new TokenListService();
 * const tokenList = await service.getTokenListForChain('0x1', abortController.signal);
 * // later, when the user changes a preference that affects the mainnet list:
 * service.invalidate('0x1');
 * // clean up when the controller is destroyed:
 * service.destroy();
 * ```
 */
export class TokenListService {
  readonly #cache = new Map<Hex, { data: TokenListMap; timestamp: number }>();

  readonly #inFlight = new Map<Hex, Promise<TokenListMap>>();

  /**
   * Returns the token list for the given chain, fetching it from the API if
   * the cache is empty or stale. Concurrent calls for the same chain share a
   * single in-flight request.
   *
   * @param chainId - The hex chain ID to fetch tokens for.
   * @param abortSignal - Used to cancel the underlying HTTP request when the
   * owning controller is destroyed or a new detection run is started.
   * @returns The normalized token list map, or an empty object if the request
   * fails and there is no previously cached value.
   */
  async getTokenListForChain(
    chainId: Hex,
    abortSignal: AbortSignal,
  ): Promise<TokenListMap> {
    const cached = this.#cache.get(chainId);
    if (cached && Date.now() - cached.timestamp < TOKEN_LIST_STALE_TIME) {
      return cached.data;
    }

    const inflight = this.#inFlight.get(chainId);
    if (inflight) {
      return inflight;
    }

    const promise = fetchAndBuildTokenListMap(chainId, abortSignal).then(
      (data) => {
        this.#inFlight.delete(chainId);
        if (data) {
          this.#cache.set(chainId, { data, timestamp: Date.now() });
          return data;
        }
        return this.#cache.get(chainId)?.data ?? {};
      },
      (error: unknown) => {
        this.#inFlight.delete(chainId);
        throw error;
      },
    );

    this.#inFlight.set(chainId, promise);
    return promise;
  }

  /**
   * Marks the cached token list for the given chain as stale so the next call
   * to {@link getTokenListForChain} will re-fetch from the API.
   *
   * @param chainId - The hex chain ID whose cache entry should be invalidated.
   */
  invalidate(chainId: Hex): void {
    this.#cache.delete(chainId);
  }

  /**
   * Clears all cached and in-flight state. Should be called when the owning
   * controller is destroyed to release memory.
   */
  destroy(): void {
    this.#cache.clear();
    this.#inFlight.clear();
  }
}
