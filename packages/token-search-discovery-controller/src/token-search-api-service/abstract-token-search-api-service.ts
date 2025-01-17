import type { TokenSearchParams, TokenSearchResponseItem } from '../types';

/**
 * Abstract class for fetching token search results.
 */
export abstract class AbstractTokenSearchApiService {
  /**
   * Fetches token search results from the portfolio API.
   *
   * @param tokenSearchParams - Optional search parameters including chains, name, and limit {@link TokenSearchParams}
   * @returns A promise resolving to an array of {@link TokenSearchResponseItem}
   */
  abstract searchTokens(
    tokenSearchParams?: TokenSearchParams,
  ): Promise<TokenSearchResponseItem[]>;
}
